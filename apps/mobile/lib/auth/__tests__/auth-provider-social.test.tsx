import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, Text } from 'react-native';

import { AuthProvider, useAuth } from '../auth-provider';
import { SOCIAL_AUTH_ERROR_MESSAGE } from '../social-auth';
import type { MobileSupabaseClient } from '../supabase';

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));

const originalAppleAuthFlag = process.env.EXPO_PUBLIC_APPLE_AUTH_ENABLED;
const originalGoogleAuthFlag = process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED;

function session(accessToken: string): Session {
  return {
    access_token: accessToken,
    expires_at: 1_999_999_999,
    expires_in: 3600,
    refresh_token: `${accessToken}-refresh`,
    token_type: 'bearer',
    user: {
      app_metadata: {},
      aud: 'authenticated',
      created_at: '2026-09-04T00:00:00.000Z',
      email: 'person@example.com',
      id: '9d5c5d95-3f76-4b9f-90c5-1cc6c3990ae2',
      user_metadata: {},
    },
  };
}

function createClient({
  initialSession = null,
  oauthError = null,
}: {
  initialSession?: Session | null;
  oauthError?: Error | null;
} = {}) {
  const passwordSession = session('password-access');
  const socialSession = session('social-access');
  const client = {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: initialSession },
        error: null,
      }),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
      setSession: jest.fn().mockResolvedValue({
        data: { session: socialSession },
        error: null,
      }),
      signInWithOAuth: jest.fn().mockResolvedValue({
        data: {
          url: oauthError
            ? null
            : 'https://project.supabase.co/auth/v1/authorize?provider=example',
        },
        error: oauthError,
      }),
      signInWithPassword: jest.fn().mockResolvedValue({
        data: { session: passwordSession },
        error: null,
      }),
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
    },
  } as unknown as MobileSupabaseClient;

  return { client, passwordSession, socialSession };
}

function AuthProbe() {
  const { feedback, phase, session: currentSession, signIn, signInWithSocial } =
    useAuth();

  return (
    <>
      <Text testID="phase">{phase}</Text>
      <Text testID="access-token">{currentSession?.access_token ?? ''}</Text>
      <Text testID="feedback">{feedback?.message ?? ''}</Text>
      <Pressable
        onPress={() => void signIn('person@example.com', 'password123')}
      >
        <Text>password sign in</Text>
      </Pressable>
      <Pressable onPress={() => void signInWithSocial('google')}>
        <Text>google sign in</Text>
      </Pressable>
    </>
  );
}

async function expectPhase(
  getByTestId: (testId: string) => { props: { children?: unknown } },
  phase: 'signedIn' | 'signedOut',
) {
  await waitFor(() => {
    expect(getByTestId('phase').props.children).toBe(phase);
  });
}

beforeEach(() => {
  delete process.env.EXPO_PUBLIC_APPLE_AUTH_ENABLED;
  delete process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED;
  jest.mocked(WebBrowser.openAuthSessionAsync).mockReset();
});

afterAll(() => {
  if (originalAppleAuthFlag === undefined) {
    delete process.env.EXPO_PUBLIC_APPLE_AUTH_ENABLED;
  } else {
    process.env.EXPO_PUBLIC_APPLE_AUTH_ENABLED = originalAppleAuthFlag;
  }

  if (originalGoogleAuthFlag === undefined) {
    delete process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED;
  } else {
    process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED = originalGoogleAuthFlag;
  }
});

describe('AuthProvider social integration', () => {
  it('keeps persisted session restoration unchanged', async () => {
    const restoredSession = session('restored-access');
    const { client } = createClient({ initialSession: restoredSession });
    const { getByTestId } = render(
      <AuthProvider client={client}>
        <AuthProbe />
      </AuthProvider>,
    );

    await expectPhase(getByTestId, 'signedIn');
    expect(getByTestId('access-token').props.children).toBe('restored-access');
  });

  it('keeps email/password sign in on the existing signedIn session contract', async () => {
    const { client } = createClient();
    const { getByText, getByTestId } = render(
      <AuthProvider client={client}>
        <AuthProbe />
      </AuthProvider>,
    );

    await expectPhase(getByTestId, 'signedOut');
    await act(async () => {
      fireEvent.press(getByText('password sign in'));
    });

    await expectPhase(getByTestId, 'signedIn');
    expect(getByTestId('access-token').props.children).toBe('password-access');
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'person@example.com',
      password: 'password123',
    });
  });

  it('enters the same signedIn contract after a successful Google callback', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED = 'true';
    const { client } = createClient();
    jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({
      type: 'success',
      url: 'keylorforge://auth/oauth#access_token=oauth-access&refresh_token=oauth-refresh',
    } as Awaited<ReturnType<typeof WebBrowser.openAuthSessionAsync>>);
    const { getByText, getByTestId } = render(
      <AuthProvider client={client}>
        <AuthProbe />
      </AuthProvider>,
    );

    await expectPhase(getByTestId, 'signedOut');
    await act(async () => {
      fireEvent.press(getByText('google sign in'));
    });

    await expectPhase(getByTestId, 'signedIn');
    expect(getByTestId('access-token').props.children).toBe('social-access');
    expect(client.auth.setSession).toHaveBeenCalledWith({
      access_token: 'oauth-access',
      refresh_token: 'oauth-refresh',
    });
  });

  it('keeps an existing session unchanged when the browser is cancelled', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED = 'true';
    const { client } = createClient({ initialSession: session('existing-access') });
    jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({
      type: 'cancel',
    } as Awaited<ReturnType<typeof WebBrowser.openAuthSessionAsync>>);
    const { getByText, getByTestId } = render(
      <AuthProvider client={client}>
        <AuthProbe />
      </AuthProvider>,
    );

    await expectPhase(getByTestId, 'signedIn');
    await act(async () => {
      fireEvent.press(getByText('google sign in'));
    });

    expect(getByTestId('phase').props.children).toBe('signedIn');
    expect(getByTestId('access-token').props.children).toBe('existing-access');
    expect(getByTestId('feedback').props.children).toBe('');
    expect(client.auth.setSession).not.toHaveBeenCalled();
  });

  it('surfaces only sanitized feedback for provider failures', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED = 'true';
    const { client } = createClient({
      oauthError: new Error('sensitive provider authorization code'),
    });
    const { getByText, getByTestId, queryByText } = render(
      <AuthProvider client={client}>
        <AuthProbe />
      </AuthProvider>,
    );

    await expectPhase(getByTestId, 'signedOut');
    await act(async () => {
      fireEvent.press(getByText('google sign in'));
    });

    expect(getByTestId('feedback').props.children).toBe(
      SOCIAL_AUTH_ERROR_MESSAGE,
    );
    expect(queryByText(/sensitive provider authorization code/i)).toBeNull();
  });
});
