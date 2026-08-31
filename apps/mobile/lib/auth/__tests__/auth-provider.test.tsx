import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { useState } from 'react';

import { AuthProvider, useAuth, type AuthPhase } from '../auth-provider';
import type { MobileSupabaseClient } from '../supabase';

type AuthListener = (
  event: 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED',
  session: Session | null,
) => void;

function session(): Session {
  return {
    access_token: 'access-token',
    expires_at: 1_999_999_999,
    expires_in: 3600,
    refresh_token: 'refresh-token',
    token_type: 'bearer',
    user: {
      app_metadata: {},
      aud: 'authenticated',
      created_at: '2026-08-30T00:00:00.000Z',
      id: '9d5c5d95-3f76-4b9f-90c5-1cc6c3990ae2',
      user_metadata: {},
    },
  };
}

function createClient({
  initialSession = null,
  restoreError = null,
  setSessionError = null,
  signInError = null,
  signUpSession = null,
  signUpError = null,
  signOutError = null,
}: {
  initialSession?: Session | null;
  restoreError?: Error | null;
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
      onAuthStateChange: jest.fn((callback: AuthListener) => {
        listener = callback;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      }),
      setSession: jest.fn().mockResolvedValue({
        data: { session: setSessionError ? null : session() },
        error: setSessionError,
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
    confirmationEmail,
    consumeConfirmationCallback,
    feedback,
    phase,
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
            'keylorfit://auth/confirm#access_token=access-token&refresh_token=refresh-token',
          ).then((result) => setCallbackResult(result.error ?? 'success'))
        }
      >
        <Text>consume confirmation</Text>
      </Pressable>
      <Pressable
        onPress={() =>
          void consumeConfirmationCallback('keylorfit://auth/confirm').then(
            (result) => setCallbackResult(result.error ?? 'success'),
          )
        }
      >
        <Text>consume malformed confirmation</Text>
      </Pressable>
      <Pressable onPress={() => void signOut()}>
        <Text>sign out</Text>
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
      options: { emailRedirectTo: 'keylorfit://auth/confirm' },
    });
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
      fireEvent.press(getByText('consume confirmation'));
    });

    await expectPhase(getByTestId, 'signedIn');
    expect(client.auth.setSession).toHaveBeenCalledWith({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    });
    expect(getByTestId('callback-result').props.children).toBe('success');
    expect(queryByText(/access-token|refresh-token/)).toBeNull();
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
      setSessionError: new Error('Token has expired: access-token'),
    });
    const { getByText, getByTestId, queryByText } = await render(
      <AuthProvider client={client}>
        <AuthProbe />
      </AuthProvider>,
    );

    await expectPhase(getByTestId, 'signedOut');
    await act(async () => {
      fireEvent.press(getByText('consume confirmation'));
    });

    expect(getByTestId('phase').props.children).toBe('signedOut');
    expect(getByTestId('callback-result').props.children).toBe(
      'This confirmation link is no longer valid. Request a new confirmation email and try again.',
    );
    expect(queryByText(/access-token|token has expired/i)).toBeNull();
  });

  it('does not exchange a duplicate confirmation after session establishment', async () => {
    const { client } = createClient();
    const { getByText, getByTestId } = await render(
      <AuthProvider client={client}>
        <AuthProbe />
      </AuthProvider>,
    );

    await expectPhase(getByTestId, 'signedOut');
    await act(async () => {
      fireEvent.press(getByText('consume confirmation'));
    });
    await expectPhase(getByTestId, 'signedIn');
    await act(async () => {
      fireEvent.press(getByText('consume confirmation'));
    });

    expect(client.auth.setSession).toHaveBeenCalledTimes(1);
    expect(getByTestId('phase').props.children).toBe('signedIn');
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
