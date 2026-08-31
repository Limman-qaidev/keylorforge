import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { Session } from '@supabase/supabase-js';
import { Pressable, Text } from 'react-native';

import { AuthProvider, useAuth, type AuthPhase } from '../auth-provider';
import type { MobileSupabaseClient } from '../supabase';

type AuthListener = (
  event: 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED',
  session: Session | null,
) => void;

function session(accessToken = 'access-token'): Session {
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
      id: '9d5c5d95-3f76-4b9f-90c5-1cc6c3990ae2',
      user_metadata: {},
    },
  };
}

function createClient({
  initialSession = null,
  refreshSessionValue = session('refreshed-access-token'),
  refreshSessionError = null,
  restoreError = null,
  signInError = null,
  signUpSession = null,
  signUpError = null,
  signOutError = null,
}: {
  initialSession?: Session | null;
  refreshSessionValue?: Session | null;
  refreshSessionError?: Error | null;
  restoreError?: Error | null;
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
    confirmationEmail,
    feedback,
    invalidateSession,
    phase,
    refreshSession,
    session: currentSession,
    signIn,
    signOut,
    signUp,
  } = useAuth();

  return (
    <>
      <Text testID="phase">{phase}</Text>
      <Text testID="confirmation">{confirmationEmail ?? ''}</Text>
      <Text testID="feedback">{feedback?.message ?? ''}</Text>
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
