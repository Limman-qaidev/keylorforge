import {
  type AuthChangeEvent,
  type AuthError,
  type Session,
} from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  getSupabaseClient,
  type MobileSupabaseClient,
} from '@/lib/auth/supabase';
import {
  CONFIRMATION_CALLBACK_URL,
  parseConfirmationCallback,
} from '@/lib/auth/confirmation-callback';
import {
  parseRecoveryCallback,
  RECOVERY_CALLBACK_URL,
} from '@/lib/auth/recovery-callback';

export type AuthPhase = 'recovery' | 'restoring' | 'signedOut' | 'signedIn';

type AuthFeedback = {
  kind: 'terminal' | 'transient';
  message: string;
};

type AuthState = {
  confirmationEmail: string | null;
  feedback: AuthFeedback | null;
  phase: AuthPhase;
  session: Session | null;
};

type AuthActionResult = { error: string } | { error?: undefined };

type RegistrationResult = AuthActionResult & {
  confirmationRequired?: boolean;
};

type AuthContextValue = AuthState & {
  clearConfirmation: () => Promise<void>;
  consumeConfirmationCallback: (url: string) => Promise<AuthActionResult>;
  consumeRecoveryCallback: (url: string) => Promise<AuthActionResult>;
  invalidateSession: () => Promise<void>;
  refreshSession: () => Promise<string | null>;
  requestPasswordRecovery: (email: string) => Promise<AuthActionResult>;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signOut: () => Promise<AuthActionResult>;
  signUp: (email: string, password: string) => Promise<RegistrationResult>;
  updateRecoveryPassword: (password: string) => Promise<AuthActionResult>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const restoringState: AuthState = {
  confirmationEmail: null,
  feedback: null,
  phase: 'restoring',
  session: null,
};

const pendingConfirmationEmailKey =
  '@keylorforge/auth/pending-confirmation-email';
const recoveryActiveKey = '@keylorforge/auth/recovery-active';

function readableAuthError(error: AuthError | Error | null): string {
  if (!error) {
    return 'Authentication could not be completed. Please try again.';
  }

  if (/invalid login credentials/i.test(error.message)) {
    return 'Email or password is incorrect.';
  }

  if (/already registered|already been registered/i.test(error.message)) {
    return 'An account already exists for this email address.';
  }

  if (/network|fetch/i.test(error.message)) {
    return 'We could not reach the authentication service. Check your connection and try again.';
  }

  return 'Authentication could not be completed. Please try again.';
}

/** A definitive invalid/revoked refresh response must not keep the shell signed in. */
export function isTerminalSessionFailure(error: Error | null): boolean {
  if (!error) {
    return false;
  }

  return /invalid refresh token|refresh token not found|refresh token.*revoked|session.*revoked/i.test(
    error.message,
  );
}

function stateForSession(session: Session | null): AuthState {
  return {
    confirmationEmail: null,
    feedback: null,
    phase: session ? 'signedIn' : 'signedOut',
    session,
  };
}

function stateForRecovery(session: Session): AuthState {
  return {
    confirmationEmail: null,
    feedback: null,
    phase: 'recovery',
    session,
  };
}

function stateForRestoredSession(
  session: Session | null,
  confirmationEmail: string | null,
  recoveryActive: boolean,
): AuthState {
  if (session && recoveryActive) {
    return stateForRecovery(session);
  }

  return {
    ...stateForSession(session),
    confirmationEmail: session ? null : confirmationEmail,
  };
}

function emailsMatch(first: string | undefined, second: string): boolean {
  return first?.trim().toLowerCase() === second.trim().toLowerCase();
}

type AuthProviderProps = PropsWithChildren<{
  client?: MobileSupabaseClient;
}>;

export function AuthProvider({
  children,
  client: providedClient,
}: AuthProviderProps) {
  const clientResult = useMemo(() => {
    if (providedClient) {
      return { client: providedClient, error: null };
    }

    try {
      return { client: getSupabaseClient(), error: null };
    } catch (error) {
      return {
        client: null,
        error:
          error instanceof Error
            ? error.message
            : 'Supabase configuration could not be read.',
      };
    }
  }, [providedClient]);
  const [authState, setAuthState] = useState<AuthState>(() => {
    if (clientResult.client) {
      return restoringState;
    }

    return {
      confirmationEmail: null,
      feedback: {
        kind: 'transient',
        message: clientResult.error ?? 'Supabase is unavailable.',
      },
      phase: 'signedOut',
      session: null,
    };
  });
  const stateRef = useRef(authState);
  const isConsumingConfirmation = useRef(false);
  const isConsumingRecovery = useRef(false);
  const isUpdatingRecoveryPassword = useRef(false);
  const sessionOperationVersion = useRef(0);

  const updateAuthState = useCallback((nextState: AuthState) => {
    stateRef.current = nextState;
    setAuthState(nextState);
  }, []);

  const setTerminalSignedOutState = useCallback(() => {
    void AsyncStorage.removeItem(recoveryActiveKey);
    updateAuthState({
      confirmationEmail: null,
      feedback: {
        kind: 'terminal',
        message: 'Your session has ended. Please sign in again.',
      },
      phase: 'signedOut',
      session: null,
    });
  }, [updateAuthState]);

  const restoreSession = useCallback(async () => {
    if (!clientResult.client) {
      updateAuthState({
        confirmationEmail: null,
        feedback: {
          kind: 'transient',
          message: clientResult.error ?? 'Supabase is unavailable.',
        },
        phase: 'signedOut',
        session: null,
      });
      return;
    }

    const operationVersion = sessionOperationVersion.current;
    const [{ data, error }, confirmationEmail, recoveryActive] =
      await Promise.all([
        clientResult.client.auth.getSession(),
        AsyncStorage.getItem(pendingConfirmationEmailKey),
        AsyncStorage.getItem(recoveryActiveKey),
      ]);
    if (operationVersion !== sessionOperationVersion.current) {
      return;
    }
    if (!error) {
      updateAuthState(
        stateForRestoredSession(
          data.session,
          confirmationEmail,
          recoveryActive === 'true',
        ),
      );
      return;
    }

    if (isTerminalSessionFailure(error)) {
      setTerminalSignedOutState();
      return;
    }

    const currentSession = stateRef.current.session;
    updateAuthState({
      confirmationEmail: null,
      feedback: { kind: 'transient', message: readableAuthError(error) },
      phase: currentSession ? 'signedIn' : 'signedOut',
      session: currentSession,
    });
  }, [
    clientResult.client,
    clientResult.error,
    setTerminalSignedOutState,
    updateAuthState,
  ]);

  useEffect(() => {
    const client = clientResult.client;
    if (!client) {
      return;
    }

    let mounted = true;
    const applyRestoration = async () => {
      await restoreSession();
    };
    const { data } = client.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        if (!mounted) {
          return;
        }

        if (event === 'SIGNED_OUT') {
          void AsyncStorage.removeItem(recoveryActiveKey);
          updateAuthState(stateForSession(null));
          return;
        }

        if (event === 'TOKEN_REFRESHED' && !session) {
          setTerminalSignedOutState();
          return;
        }

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (
            session &&
            (isConsumingRecovery.current ||
              stateRef.current.phase === 'recovery')
          ) {
            updateAuthState(stateForRecovery(session));
            return;
          }
          updateAuthState(stateForSession(session));
        }
      },
    );

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        client.auth.startAutoRefresh();
        void applyRestoration();
      } else {
        client.auth.stopAutoRefresh();
      }
    };

    if (AppState.currentState === 'active') {
      client.auth.startAutoRefresh();
    }
    const appStateSubscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );
    void applyRestoration();

    return () => {
      mounted = false;
      appStateSubscription.remove();
      client.auth.stopAutoRefresh();
      data.subscription.unsubscribe();
    };
  }, [
    clientResult.client,
    restoreSession,
    setTerminalSignedOutState,
    updateAuthState,
  ]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthActionResult> => {
      const client = clientResult.client;
      if (!client) {
        return { error: clientResult.error ?? 'Supabase is unavailable.' };
      }

      const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        const message = readableAuthError(error);
        updateAuthState({
          confirmationEmail: null,
          feedback: { kind: 'transient', message },
          phase: 'signedOut',
          session: null,
        });
        return { error: message };
      }

      updateAuthState(stateForSession(data.session));
      void AsyncStorage.removeItem(recoveryActiveKey);
      return {};
    },
    [clientResult.client, clientResult.error, updateAuthState],
  );

  const requestPasswordRecovery = useCallback(
    async (email: string): Promise<AuthActionResult> => {
      const client = clientResult.client;
      if (!client) {
        return { error: clientResult.error ?? 'Supabase is unavailable.' };
      }

      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: RECOVERY_CALLBACK_URL,
      });
      if (error) {
        return {
          error:
            'We could not send the recovery email. Check your connection and try again.',
        };
      }

      return {};
    },
    [clientResult.client, clientResult.error],
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<RegistrationResult> => {
      const client = clientResult.client;
      if (!client) {
        return { error: clientResult.error ?? 'Supabase is unavailable.' };
      }

      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: CONFIRMATION_CALLBACK_URL },
      });
      if (error) {
        const message = readableAuthError(error);
        updateAuthState({
          confirmationEmail: null,
          feedback: { kind: 'transient', message },
          phase: 'signedOut',
          session: null,
        });
        return { error: message };
      }

      if (data.session) {
        updateAuthState(stateForSession(data.session));
        return {};
      }

      updateAuthState({
        confirmationEmail: email,
        feedback: null,
        phase: 'signedOut',
        session: null,
      });
      await AsyncStorage.setItem(pendingConfirmationEmailKey, email);
      return { confirmationRequired: true };
    },
    [clientResult.client, clientResult.error, updateAuthState],
  );

  const consumeConfirmationCallback = useCallback(
    async (url: string): Promise<AuthActionResult> => {
      const client = clientResult.client;
      if (!client) {
        return { error: clientResult.error ?? 'Supabase is unavailable.' };
      }

      if (
        isConsumingConfirmation.current ||
        stateRef.current.phase === 'signedIn'
      ) {
        return {};
      }

      const callback = parseConfirmationCallback(url);
      if (callback.kind === 'providerError') {
        return {
          error:
            'This confirmation link is no longer valid. Request a new confirmation email and try again.',
        };
      }

      if (callback.kind === 'invalid') {
        return {
          error:
            'We could not confirm this link. Request a new confirmation email and try again.',
        };
      }

      isConsumingConfirmation.current = true;
      sessionOperationVersion.current += 1;
      try {
        const confirmationEmail =
          stateRef.current.confirmationEmail ??
          (await AsyncStorage.getItem(pendingConfirmationEmailKey));
        if (!confirmationEmail) {
          return {
            error:
              'We could not confirm this link. Request a new confirmation email and try again.',
          };
        }

        const { data: userData, error: userError } = await client.auth.getUser(
          callback.accessToken,
        );
        if (
          userError ||
          !userData.user ||
          !emailsMatch(userData.user.email, confirmationEmail)
        ) {
          return {
            error:
              'This confirmation link is no longer valid. Request a new confirmation email and try again.',
          };
        }

        await AsyncStorage.removeItem(pendingConfirmationEmailKey);
        updateAuthState(stateForSession(null));
        return {};
      } catch {
        return {
          error:
            'This confirmation link is no longer valid. Request a new confirmation email and try again.',
        };
      } finally {
        isConsumingConfirmation.current = false;
      }
    },
    [clientResult.client, clientResult.error, updateAuthState],
  );

  const consumeRecoveryCallback = useCallback(
    async (url: string): Promise<AuthActionResult> => {
      const client = clientResult.client;
      if (!client) {
        return { error: clientResult.error ?? 'Supabase is unavailable.' };
      }

      if (
        isConsumingRecovery.current ||
        stateRef.current.phase === 'recovery'
      ) {
        return {};
      }

      if (stateRef.current.phase === 'signedIn') {
        return {
          error:
            'This recovery link cannot be used while you are signed in. Sign out and request a new link.',
        };
      }

      const callback = parseRecoveryCallback(url);
      if (callback.kind === 'providerError') {
        return {
          error:
            'This recovery link is no longer valid. Request a new recovery email and try again.',
        };
      }

      if (callback.kind === 'invalid') {
        return {
          error:
            'We could not use this recovery link. Request a new recovery email and try again.',
        };
      }

      isConsumingRecovery.current = true;
      sessionOperationVersion.current += 1;
      try {
        await AsyncStorage.setItem(recoveryActiveKey, 'true');
        const { data, error } = await client.auth.setSession({
          access_token: callback.accessToken,
          refresh_token: callback.refreshToken,
        });
        if (error || !data.session) {
          try {
            await client.auth.signOut({ scope: 'local' });
          } finally {
            try {
              await AsyncStorage.removeItem(recoveryActiveKey);
            } catch {
              // No recovery state is exposed after a failed callback.
            }
          }
          return {
            error:
              'This recovery link is no longer valid. Request a new recovery email and try again.',
          };
        }

        updateAuthState(stateForRecovery(data.session));
        return {};
      } catch {
        try {
          await client.auth.signOut({ scope: 'local' });
        } catch {
          // Local state is still cleared below if remote cleanup fails.
        } finally {
          try {
            await AsyncStorage.removeItem(recoveryActiveKey);
          } catch {
            // No recovery state is exposed after a failed callback.
          }
        }
        return {
          error:
            'This recovery link is no longer valid. Request a new recovery email and try again.',
        };
      } finally {
        isConsumingRecovery.current = false;
      }
    },
    [clientResult.client, clientResult.error, updateAuthState],
  );

  const updateRecoveryPassword = useCallback(
    async (password: string): Promise<AuthActionResult> => {
      const client = clientResult.client;
      if (!client || stateRef.current.phase !== 'recovery') {
        return {
          error:
            'This recovery session is no longer valid. Request a new recovery email and try again.',
        };
      }

      if (isUpdatingRecoveryPassword.current) {
        return { error: 'Your password update is already in progress.' };
      }

      isUpdatingRecoveryPassword.current = true;
      try {
        try {
          const { error } = await client.auth.updateUser({ password });
          if (error) {
            return {
              error:
                'We could not update your password. Request a new recovery email and try again.',
            };
          }
        } catch {
          return {
            error:
              'We could not update your password. Request a new recovery email and try again.',
          };
        }

        try {
          await client.auth.signOut({ scope: 'local' });
        } finally {
          try {
            await AsyncStorage.removeItem(recoveryActiveKey);
          } finally {
            updateAuthState(stateForSession(null));
          }
        }

        return {};
      } finally {
        isUpdatingRecoveryPassword.current = false;
      }
    },
    [clientResult.client, updateAuthState],
  );

  /**
   * Refreshes the Supabase session for a protected API retry.
   *
   * A terminal refresh failure signs the app out and returns null. Transient
   * provider/network failures leave the current session intact and reject so the
   * caller can surface a retryable error without destroying valid credentials.
   */
  const refreshSession = useCallback(async (): Promise<string | null> => {
    const client = clientResult.client;
    if (!client) {
      setTerminalSignedOutState();
      return null;
    }

    let response: Awaited<ReturnType<typeof client.auth.refreshSession>>;
    try {
      response = await client.auth.refreshSession();
    } catch (error) {
      const refreshError =
        error instanceof Error ? error : new Error('session refresh failed');
      if (isTerminalSessionFailure(refreshError)) {
        setTerminalSignedOutState();
        return null;
      }
      throw new Error(readableAuthError(refreshError));
    }

    if (response.error) {
      if (isTerminalSessionFailure(response.error)) {
        setTerminalSignedOutState();
        return null;
      }
      throw new Error(readableAuthError(response.error));
    }

    if (!response.data.session) {
      setTerminalSignedOutState();
      return null;
    }

    updateAuthState(stateForSession(response.data.session));
    return response.data.session.access_token;
  }, [clientResult.client, setTerminalSignedOutState, updateAuthState]);

  const signOut = useCallback(async (): Promise<AuthActionResult> => {
    const client = clientResult.client;
    if (!client) {
      updateAuthState(stateForSession(null));
      return {};
    }

    const { error } = await client.auth.signOut();
    if (error) {
      return { error: readableAuthError(error) };
    }

    updateAuthState(stateForSession(null));
    await AsyncStorage.removeItem(pendingConfirmationEmailKey);
    await AsyncStorage.removeItem(recoveryActiveKey);
    return {};
  }, [clientResult.client, updateAuthState]);

  /**
   * Ends this device's session after a terminal protected-API authentication
   * failure. Local state is cleared even when Supabase cannot revoke remotely.
   */
  const invalidateSession = useCallback(async (): Promise<void> => {
    try {
      await clientResult.client?.auth.signOut({ scope: 'local' });
    } finally {
      setTerminalSignedOutState();
    }
  }, [clientResult.client, setTerminalSignedOutState]);

  const clearConfirmation = useCallback(async () => {
    updateAuthState({ ...stateForSession(null), confirmationEmail: null });
    try {
      await AsyncStorage.removeItem(pendingConfirmationEmailKey);
    } catch {
      // The in-memory state is already cleared; navigation must remain usable.
    }
  }, [updateAuthState]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...authState,
      clearConfirmation,
      consumeConfirmationCallback,
      consumeRecoveryCallback,
      invalidateSession,
      refreshSession,
      requestPasswordRecovery,
      signIn,
      signOut,
      signUp,
      updateRecoveryPassword,
    }),
    [
      authState,
      clearConfirmation,
      consumeConfirmationCallback,
      consumeRecoveryCallback,
      invalidateSession,
      refreshSession,
      requestPasswordRecovery,
      signIn,
      signOut,
      signUp,
      updateRecoveryPassword,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be rendered within AuthProvider.');
  }

  return value;
}
