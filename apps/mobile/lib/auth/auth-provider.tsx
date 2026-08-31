import {
  type AuthChangeEvent,
  type AuthError,
  type Session,
} from '@supabase/supabase-js';
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

export type AuthPhase = 'restoring' | 'signedOut' | 'signedIn';

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
  clearConfirmation: () => void;
  invalidateSession: () => Promise<void>;
  refreshSession: () => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signOut: () => Promise<AuthActionResult>;
  signUp: (email: string, password: string) => Promise<RegistrationResult>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const restoringState: AuthState = {
  confirmationEmail: null,
  feedback: null,
  phase: 'restoring',
  session: null,
};

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

  const updateAuthState = useCallback((nextState: AuthState) => {
    stateRef.current = nextState;
    setAuthState(nextState);
  }, []);

  const setTerminalSignedOutState = useCallback(() => {
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

    const { data, error } = await clientResult.client.auth.getSession();
    if (!error) {
      updateAuthState(stateForSession(data.session));
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
          updateAuthState(stateForSession(null));
          return;
        }

        if (event === 'TOKEN_REFRESHED' && !session) {
          setTerminalSignedOutState();
          return;
        }

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
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
      return {};
    },
    [clientResult.client, clientResult.error, updateAuthState],
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<RegistrationResult> => {
      const client = clientResult.client;
      if (!client) {
        return { error: clientResult.error ?? 'Supabase is unavailable.' };
      }

      const { data, error } = await client.auth.signUp({ email, password });
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
      return { confirmationRequired: true };
    },
    [clientResult.client, clientResult.error, updateAuthState],
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

  const clearConfirmation = useCallback(() => {
    updateAuthState({ ...stateForSession(null), confirmationEmail: null });
  }, [updateAuthState]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...authState,
      clearConfirmation,
      invalidateSession,
      refreshSession,
      signIn,
      signOut,
      signUp,
    }),
    [
      authState,
      clearConfirmation,
      invalidateSession,
      refreshSession,
      signIn,
      signOut,
      signUp,
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
