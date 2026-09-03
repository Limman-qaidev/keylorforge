import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, Text } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { useState } from 'react';

import { AuthProvider, useAuth, type AuthPhase } from '../auth-provider';
import type { MobileSupabaseClient } from '../supabase';

type AuthListener = (
  event: 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED',
  session: Session | null,
) => void;

function session(
  accessToken = 'access-token',
  email = 'person@example.com',
): Session {
  return {
    access_token: accessToken,
    expires_at: 1_999_999_999,
    expires_in: 3600,
    refresh_token: 'refresh-token',
    token_type: 'bearer',
    user: {
      app_metadata: {},
      aud: 'authenticated',
      created_at: '2026-08-30T00:00:00.000Z',
      email,
      id: '9d5c5d95-3f76-4b9f-90c5-1cc6c3990ae2',
      user_metadata: {},
    },
  };
}

function createClient({
  initialSession = null,
  verifiedUserEmail = 'person@example.com',
  getUserError = null,
  getUserException = null,
  refreshSessionValue = session('refreshed-access-token'),
  refreshSessionError = null,
  restoreError = null,
  setSessionException = null,
  setSessionError = null,
  signInError = null,
  signUpSession = null,
  signUpError = null,
  signOutError = null,
}: {
  initialSession?: Session | null;
  verifiedUserEmail?: string;
  getUserError?: Error | null;
  getUserException?: Error | null;
  refreshSessionValue?: Session | null;
  refreshSessionError?: Error | null;
  restoreError?: Error | null;
  setSessionException?: Error | null;
  setSessionError?: Error | null;
  signInError?: Error | null;
  signUpError?: Error | null;
  signUpSession?: Session | null;
  signOutError?: Error | null;
} = {}) {
  let listener: AuthListener | undefined;
  const client = {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: initialSession },
        error: restoreError,
      }),
      getUser: getUserException
        ? jest.fn().mockRejectedValue(getUserException)
        : jest.fn().mockResolvedValue({
            data: {
              user: getUserError
                ? null
                : session('access-token', verifiedUserEmail).user,
            },
            error: getUserError,
          }),
      onAuthStateChange: jest.fn((callback: AuthListener) => {
        listener = callback;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      }),
      setSession: setSessionException
        ? jest.fn().mockRejectedValue(setSessionException)
        : jest.fn().mockResolvedValue({
            data: {
              session: setSessionError
                ? null
                : session('access-token', verifiedUserEmail),
            },
            error: setSessionError,
          }),
      refreshSession: jest.fn().mockResolvedValue({
        data: { session: refreshSessionError ? null : refreshSessionValue },
        error: refreshSessionError,
      }),
      signInWithPassword: jest.fn().mockResolvedValue({
        data: { session: signInError ? null : session() },
        error: signInError,
      }),
      signOut: jest.fn().mockResolvedValue({ error: signOutError }),
      signUp: jest.fn().mockResolvedValue({
        data: { session: signUpSession },
        error: signUpError,
      }),
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
    },
  } as unknown as MobileSupabaseClient;

  return {
    client,
    emit(
      event: 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED',
      nextSession: Session | null,
    ) {
      listener?.(event, nextSession);
    },
  };
}

function AuthProbe() {
  const {
    clearConfirmation,
    confirmationEmail,
    consumeConfirmationCallback,
    feedback,
    phase,
    invalidateSession,
    refreshSession,
    session: currentSession,
    signIn,
    signOut,
    signUp,
  } = useAuth();
  const [callbackResult, setCallbackResult] = useState('');

  return (
    <>
      <Text testID="phase">{phase}</Text>
      <Text testID="confirmation">{confirmationEmail ?? ''}</Text>
      <Text testID="feedback">{feedback?.message ?? ''}</Text>
      <Text testID="callback-result">{callbackResult}</Text>
      <Text testID="access-token">{currentSession?.access_token ?? ''}</Text>
      <Pressable
        onPress={() => void signIn('person@example.com', 'password123')}
      >
        <Text>sign in</Text>
      </Pressable>
      <Pressable
        onPress={() => void signUp('person@example.com', 'password123')}
      >
        <Text>sign up</Text>
      </Pressable>
      <Pressable
        onPress={() =>
          void consumeConfirmationCallback(
            'keylorforge://auth/confirm#access_token=access-token&refresh_token=refresh-token',
          ).then((result) => setCallbackResult(result.error ?? 'success'))
        }
      >
        <Text>consume confirmation</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          void consumeConfirmationCallback(
            'keylorforge://auth/confirm#access_token=access-token&refresh_token=refresh-token',
          );
          void consumeConfirmationCallback(
            'keylorforge://auth/confirm#access_token=access-token&refresh_token=refresh-token',
          );
        }}
      >
        <Text>consume confirmation twice</Text>
      </Pressable>
      <Pressable
        onPress={() =>
          void consumeConfirmationCallback('keylorforge://auth/confirm').then(
            (result) => setCallbackResult(result.error ?? 'success'),
          )
        }
      >
        <Text>consume malformed confirmation</Text>
      </Pressable>
      <Pressable onPress={() => void clearConfirmation()}>
        <Text>clear confirmation</Text>
      </Pressable>
      <Pressable onPress={() => void signOut()}>
        <Text>sign out</Text>
      </Pressable>
      <Pressable onPress={() => void invalidateSession()}>
        <Text>invalidate session</Text>
      </Pressable>
      <Pressable onPress={() => void refreshSession()}>
        <Text>refresh session</Text>
      </Pressable>
    </>
  );
}

async function expectPhase(
  getByTestId: (testId: string) => { props: { children?: unknown } },
  phase: AuthPhase,
) {
  await waitFor(() => {
    expect(getByTestId('phase').props.children).toBe(phase);
  });
}

describe('AuthProvider', () => {
  it('restores the persisted session before exposing the signed-in shell', async () => {
    const { client } = createClient({ initialSession: session() });
    const { getByTestId } = await render(
      <AuthProvider client={client}>
        <AuthProbe />
      </AuthProvider>,
    );

    await expectPhase(getByTestId, 'signedIn');
  });

  it('maps invalid login credentials to a readable error', async () => {
    const { client } = createClient({
      signInError: new Error('Invalid login credentials'),
    });
    const { getByText, getByTestId } = await render(
      <AuthProvider client={client}>
        <AuthProbe />
      </AuthProvider>,
    );

    await expectPhase(getByTestId, 'signedOut');
    await act(async () => {
      fireEvent.press(getByText('sign in'));
    });

    await waitFor(() => {
      expect(getByTestId('feedback').props.children).toBe(
        'Email or password is incorrect.',
      );
    });
  });

  it('keeps a confirmation-required registration signed out', async () => {
    const { client } = createClient();
    const { getByText, getByTestId } = await render(
      <AuthProvider client={client}>
        <AuthProbe />
      </AuthProvider>,
    );

    await expectPhase(getByTestId, 'signedOut');
    await act(async () => {
      fireEvent.press(getByText('sign up'));
    });

    await waitFor(() => {
      expect(getByTestId('confirmation').props.children).toBe(
        'person@example.com',
      );
      expect(getByTestId('phase').props.children).toBe('signedOut');
    });
    expect(client.auth.signUp).toHaveBeenCalledWith({
      email: 'person@example.com',
      password: 'password123',
      options: { emailRedirectTo: 'keylorforge://auth/confirm' },
    });
  });

  it('clears the pending confirmation from memory and storage', async () => {
    const { client } = createClient();
    const { getByText, getByTestId } = await render(
      <AuthProvider client={client}>
        <AuthProbe />
      </AuthProvider>,
    );

    await expectPhase(getByTestId, 'signedOut');
    await act(async () => {
      fireEvent.press(getByText('sign up'));
    });
    await waitFor(() => {
      expect(getByTestId('confirmation').props.children).toBe(
        'person@example.com',
      );
    });

    await act(async () => {
      fireEvent.press(getByText('clear confirmation'));
    });
    await waitFor(() => {
      expect(getByTestId('confirmation').props.children).toBe('');
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith(
        '@keylorforge/auth/pending-confirmation-email',
      );
    });
  });

  it('consumes a valid callback after cold-start restoration leaves the pending email only in storage', async () => {
    await AsyncStorage.setItem(
      '@keylorforge/auth/pending-confirmation-email',
      'person@example.com',
    );
    const auth = createClient();
    const { getByText, getByTestId } = await render(
      <AuthProvider client={auth.client}>
        <AuthProbe />
      </AuthProvider>,
    );

    await expectPhase(getByTestId, 'signedOut');
    await act(async () => {
      auth.emit('SIGNED_OUT', null);
    });
    expect(getByTestId('confirmation').props.children).toBe('');

    await act(async () => {
      fireEvent.press(getByText('consume confirmation'));
    });

    await expectPhase(getByTestId, 'signedOut');
    expect(auth.client.auth.getUser).toHaveBeenCalledWith('access-token');
    expect(auth.client.auth.setSession).not.toHaveBeenCalled();
  });

  it('keeps a persisted-only confirmation callback single-flight', async () => {
    await AsyncStorage.setItem(
      '@keylorforge/auth/pending-confirmation-email',
      'person@example.com',
    );
    const auth = createClient();
    const { getByText, getByTestId } = await render(
      <AuthProvider client={auth.client}>
        <AuthProbe />
      </AuthProvider>,
    );

    await expectPhase(getByTestId, 'signedOut');
    await act(async () => {
      auth.emit('SIGNED_OUT', null);
    });
    await act(async () => {
      fireEvent.press(getByText('consume confirmation twice'));
    });

    await expectPhase(getByTestId, 'signedOut');
    expect(auth.client.auth.getUser).toHaveBeenCalledTimes(1);
    expect(auth.client.auth.setSession).not.toHaveBeenCalled();
  });

  it('fails safely when persisted confirmation lookup rejects', async () => {
    const { client } = createClient();
    const { getByText, getByTestId } = await render(
      <AuthProvider client={client}>
        <AuthProbe />
      </AuthProvider>,
    );

    await expectPhase(getByTestId, 'signedOut');
    jest
      .mocked(AsyncStorage.getItem)
      .mockRejectedValueOnce(new Error('sensitive storage detail'));
    await act(async () => {
      fireEvent.press(getByText('consume confirmation'));
    });

    expect(getByTestId('phase').props.children).toBe('signedOut');
    expect(getByTestId('callback-result').props.children).toBe(
      'This confirmation link is no longer valid. Request a new confirmation email and try again.',
    );
    expect(client.auth.getUser).not.toHaveBeenCalled();
    expect(client.auth.setSession).not.toHaveBeenCalled();
  });

  it('consumes a valid confirmation callback without rendering its credentials', async () => {
    const { client } = createClient();
    const { getByText, getByTestId, queryByText } = await render(
      <AuthProvider client={client}>
        <AuthProbe />
      </AuthProvider>,
    );

    await expectPhase(getByTestId, 'signedOut');
    await act(async () => {
      fireEvent.press(getByText('sign up'));
    });
    await act(async () => {
      fireEvent.press(getByText('consume confirmation'));
    });

    await expectPhase(getByTestId, 'signedOut');
    expect(client.auth.getUser).toHaveBeenCalledWith('access-token');
    expect(client.auth.setSession).not.toHaveBeenCalled();
    expect(getByTestId('callback-result').props.children).toBe('success');
    expect(queryByText('refresh-token')).toBeNull();
  });

  it('rejects a malformed confirmation callback without mutating the session', async () => {
    const { client } = createClient();
    const { getByText, getByTestId } = await render(
      <AuthProvider client={client}>
        <AuthProbe />
      </AuthProvider>,
    );

    await expectPhase(getByTestId, 'signedOut');
    await act(async () => {
      fireEvent.press(getByText('consume malformed confirmation'));
    });

    expect(client.auth.setSession).not.toHaveBeenCalled();
    expect(getByTestId('callback-result').props.children).toBe(
      'We could not confirm this link. Request a new confirmation email and try again.',
    );
  });

  it('fails safely when Supabase rejects an expired confirmation callback', async () => {
    const { client } = createClient({
      getUserError: new Error('Token has expired: access-token'),
    });
    const { getByText, getByTestId, queryByText } = await render(
      <AuthProvider client={client}>
        <AuthProbe />
      </AuthProvider>,
    );

    await expectPhase(getByTestId, 'signedOut');
    await act(async () => {
      fireEvent.press(getByText('sign up'));
    });
    await act(async () => {
      fireEvent.press(getByText('consume confirmation'));
    });

    expect(getByTestId('phase').props.children).toBe('signedOut');
    expect(getByTestId('callback-result').props.children).toBe(
      'This confirmation link is no longer valid. Request a new confirmation email and try again.',
    );
    expect(client.auth.setSession).not.toHaveBeenCalled();
    expect(queryByText(/access-token|token has expired/i)).toBeNull();
  });

  it('fails safely when provider validation throws', async () => {
    const { client } = createClient({
      getUserException: new Error('sensitive provider detail: access-token'),
    });
    const { getByText, getByTestId, queryByText } = await render(
      <AuthProvider client={client}>
        <AuthProbe />
      </AuthProvider>,
    );

    await expectPhase(getByTestId, 'signedOut');
    await act(async () => {
      fireEvent.press(getByText('sign up'));
    });
    await act(async () => {
      fireEvent.press(getByText('consume confirmation'));
    });

    expect(getByTestId('phase').props.children).toBe('signedOut');
    expect(getByTestId('callback-result').props.children).toBe(
      'This confirmation link is no longer valid. Request a new confirmation email and try again.',
    );
    expect(client.auth.setSession).not.toHaveBeenCalled();
    expect(queryByText(/sensitive provider detail|access-token/i)).toBeNull();
  });

  it('rejects a callback for an account other than the pending registration before setting a session', async () => {
    const { client } = createClient({
      verifiedUserEmail: 'attacker@example.com',
    });
    const { getByText, getByTestId } = await render(
      <AuthProvider client={client}>
        <AuthProbe />
      </AuthProvider>,
    );

    await expectPhase(getByTestId, 'signedOut');
    await act(async () => {
      fireEvent.press(getByText('sign up'));
    });
    await act(async () => {
      fireEvent.press(getByText('consume confirmation'));
    });

    expect(getByTestId('phase').props.children).toBe('signedOut');
    expect(client.auth.setSession).not.toHaveBeenCalled();
    expect(getByTestId('callback-result').props.children).toBe(
      'This confirmation link is no longer valid. Request a new confirmation email and try again.',
    );
  });

  it('does not consume a duplicate confirmation after pending state is cleared', async () => {
    const { client } = createClient();
    const { getByText, getByTestId } = await render(
      <AuthProvider client={client}>
        <AuthProbe />
      </AuthProvider>,
    );

    await expectPhase(getByTestId, 'signedOut');
    await act(async () => {
      fireEvent.press(getByText('sign up'));
    });
    await act(async () => {
      fireEvent.press(getByText('consume confirmation'));
    });
    await expectPhase(getByTestId, 'signedOut');
    await act(async () => {
      fireEvent.press(getByText('consume confirmation'));
    });

    expect(client.auth.getUser).toHaveBeenCalledTimes(1);
    expect(client.auth.setSession).not.toHaveBeenCalled();
    expect(getByTestId('phase').props.children).toBe('signedOut');
  });

  it('clears the local authenticated state after logout', async () => {
    const { client } = createClient({ initialSession: session() });
    const { getByText, getByTestId } = await render(
      <AuthProvider client={client}>
        <AuthProbe />
      </AuthProvider>,
    );

    await expectPhase(getByTestId, 'signedIn');
    await act(async () => {
      fireEvent.press(getByText('sign out'));
    });
    await expectPhase(getByTestId, 'signedOut');
  });

  it('fails closed locally when terminal API auth invalidation cannot revoke remotely', async () => {
    const remoteFailure = new Error('network failed');
    const { client } = createClient({
      initialSession: session(),
      signOutError: remoteFailure,
    });
    const { getByText, getByTestId } = await render(
      <AuthProvider client={client}>
        <AuthProbe />
      </AuthProvider>,
    );

    await expectPhase(getByTestId, 'signedIn');
    await act(async () => {
      fireEvent.press(getByText('invalidate session'));
    });

    await expectPhase(getByTestId, 'signedOut');
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(getByTestId('feedback').props.children).toBe(
      'Your session has ended. Please sign in again.',
    );
  });

  it('refreshes an expired access token without ending a valid session', async () => {
    const { client } = createClient({
      initialSession: session('expired-access-token'),
      refreshSessionValue: session('fresh-access-token'),
    });
    const { getByText, getByTestId } = await render(
      <AuthProvider client={client}>
        <AuthProbe />
      </AuthProvider>,
    );

    await expectPhase(getByTestId, 'signedIn');
    await act(async () => {
      fireEvent.press(getByText('refresh session'));
    });

    await waitFor(() => {
      expect(getByTestId('access-token').props.children).toBe(
        'fresh-access-token',
      );
    });
    expect(getByTestId('phase').props.children).toBe('signedIn');
    expect(client.auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('fails closed when an explicit refresh finds revoked credentials', async () => {
    const { client } = createClient({
      initialSession: session(),
      refreshSessionError: new Error('Invalid refresh token: session revoked'),
    });
    const { getByText, getByTestId } = await render(
      <AuthProvider client={client}>
        <AuthProbe />
      </AuthProvider>,
    );

    await expectPhase(getByTestId, 'signedIn');
    await act(async () => {
      fireEvent.press(getByText('refresh session'));
    });

    await expectPhase(getByTestId, 'signedOut');
    expect(getByTestId('feedback').props.children).toBe(
      'Your session has ended. Please sign in again.',
    );
  });

  it('keeps the shell signed in after a successful token refresh', async () => {
    const auth = createClient({ initialSession: session() });
    const { getByTestId } = await render(
      <AuthProvider client={auth.client}>
        <AuthProbe />
      </AuthProvider>,
    );

    await expectPhase(getByTestId, 'signedIn');
    await act(async () => {
      auth.emit('TOKEN_REFRESHED', session());
    });
    expect(getByTestId('phase').props.children).toBe('signedIn');
  });

  it('fails closed when restoring finds a revoked refresh credential', async () => {
    const { client } = createClient({
      restoreError: new Error('Invalid refresh token: session revoked'),
    });
    const { getByTestId } = await render(
      <AuthProvider client={client}>
        <AuthProbe />
      </AuthProvider>,
    );

    await expectPhase(getByTestId, 'signedOut');
    expect(getByTestId('feedback').props.children).toBe(
      'Your session has ended. Please sign in again.',
    );
  });

  it('fails closed when a token refresh yields no session', async () => {
    const auth = createClient({ initialSession: session() });
    const { getByTestId } = await render(
      <AuthProvider client={auth.client}>
        <AuthProbe />
      </AuthProvider>,
    );

    await expectPhase(getByTestId, 'signedIn');
    await act(async () => {
      auth.emit('TOKEN_REFRESHED', null);
    });
    expect(getByTestId('phase').props.children).toBe('signedOut');
    expect(getByTestId('feedback').props.children).toBe(
      'Your session has ended. Please sign in again.',
    );
  });
});
