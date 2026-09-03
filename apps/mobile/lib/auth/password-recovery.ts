import {
  createClient,
  type AuthError,
  type SupabaseClient,
} from '@supabase/supabase-js';

export type RecoveryActionResult = { error: string } | { error?: undefined };

type RecoveryClient = Pick<SupabaseClient, 'auth'>;

type MemoryStorage = {
  getItem: (key: string) => Promise<string | null>;
  removeItem: (key: string) => Promise<void>;
  setItem: (key: string, value: string) => Promise<void>;
};

function createMemoryStorage(): MemoryStorage {
  const values = new Map<string, string>();

  return {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async removeItem(key) {
      values.delete(key);
    },
    async setItem(key, value) {
      values.set(key, value);
    },
  };
}

function createRecoveryClient(): RecoveryClient {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error('Supabase recovery is not configured.');
  }

  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: true,
      storage: createMemoryStorage(),
    },
  });
}

function authErrorCode(error: AuthError | Error): string | undefined {
  if ('code' in error && typeof error.code === 'string') {
    return error.code;
  }

  return undefined;
}

function passwordUpdateError(error: AuthError | Error): string {
  const code = authErrorCode(error);

  if (code === 'weak_password') {
    return 'Choose a stronger password that meets the required security rules.';
  }

  if (code === 'same_password') {
    return 'Choose a password different from your current password.';
  }

  if (
    code === 'session_expired' ||
    code === 'session_not_found' ||
    code === 'reauthentication_needed'
  ) {
    return 'This recovery session has expired. Request a new recovery code and try again.';
  }

  if (/network|fetch/i.test(error.message)) {
    return 'We could not reach the authentication service. Check your connection and try again.';
  }

  return 'We could not update your password. Try again.';
}

export class PasswordRecoveryController {
  private readonly client: RecoveryClient;
  private verified = false;

  constructor(client?: RecoveryClient) {
    this.client = client ?? createRecoveryClient();
  }

  async requestCode(email: string): Promise<RecoveryActionResult> {
    try {
      const { error } = await this.client.auth.resetPasswordForEmail(email);
      if (!error) {
        return {};
      }
    } catch {
      // Account existence and provider detail must not be exposed to the client.
    }

    return {
      error:
        'We could not send the recovery code. Check your connection and try again.',
    };
  }

  async verifyCode(
    email: string,
    token: string,
  ): Promise<RecoveryActionResult> {
    try {
      const { data, error } = await this.client.auth.verifyOtp({
        email,
        token,
        type: 'recovery',
      });

      if (error || !data.session) {
        return {
          error:
            'This recovery code is invalid or expired. Request a new code and try again.',
        };
      }

      this.verified = true;
      return {};
    } catch {
      return {
        error:
          'This recovery code is invalid or expired. Request a new code and try again.',
      };
    }
  }

  async updatePassword(password: string): Promise<RecoveryActionResult> {
    if (!this.verified) {
      return {
        error:
          'This recovery session is no longer valid. Request a new recovery code and try again.',
      };
    }

    try {
      const { error } = await this.client.auth.updateUser({ password });
      if (error) {
        return { error: passwordUpdateError(error) };
      }

      const { error: signOutError } = await this.client.auth.signOut({
        scope: 'local',
      });
      if (signOutError) {
        return {
          error:
            'Your password was updated, but recovery could not be closed safely. Restart the app before signing in.',
        };
      }

      this.verified = false;
      return {};
    } catch (error) {
      return {
        error: passwordUpdateError(
          error instanceof Error ? error : new Error('password update failed'),
        ),
      };
    }
  }

  async cancel(): Promise<void> {
    this.verified = false;
    try {
      await this.client.auth.signOut({ scope: 'local' });
    } catch {
      // The recovery client stores its session in memory only and is discarded.
    }
  }
}
