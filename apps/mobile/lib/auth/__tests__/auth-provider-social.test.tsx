import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { Session } from '@supabase/supabase-js';
import { Pressable, Text } from 'react-native';
import * as Linking from 'expo-linking';

import { AuthProvider, useAuth } from '../auth-provider';
import type { MobileSupabaseClient } from '../supabase';

jest.mock('expo-linking', () => ({
  openURL: jest.fn().mockResolvedValue(true),
}));

const mockOpenUrl = Linking.openURL as jest.MockedFunction<typeof Linking.openURL>;

function session(): Session {
  return {
    access_token: 'social-access-token',
    expires_at: 1_999_999_999,
    expires_in: 3600,
    refresh_token: 'social-refresh-token',
    token_type: 'bearer',
    user: {
      app_metadata: {},
      aud: 'authenticated',
      created_at: '2026-09-04T00:00:00.000Z',
      email: 'social@example.com',
      id: '31f50865-f2a3-4d17-a738-c715dc19d606',
      user_metadata: {},
    },
  };
}

function createClient() {
  const auth = {
    getSession: jest.fn().mockResolvedValue({
      data: { session: null },
      error: null,
    }),
    getUser: jest.fn(),
    onAuthStateChange: jest.fn(() => ({
      data: { subscription: { unsubscribe: jest.fn() } },
    })),
    refreshSession: jest.fn(),
    setSession: jest.fn().mockResolvedValue({
      data: { session: session() },
      error: null,
    }),
    signInWithOAuth: jest.fn().mockResolvedValue({
      data: {
        provider: 'google',
        url: 'https://project.supabase.co/auth/v1/authorize?provider=google',
      },
      error: null,
    }),
    signInWithPassword: jest.fn(),
    signOut: jest.fn(),
    signUp: jest.fn(),
    startAutoRefresh: jest.fn(),
    stopAutoRefresh: jest.fn(),
  };

  return { auth, client: { auth } as unknown as MobileSupabaseClient };
}

function Probe() {
  const {
    consumeSocialAuthCallback,
    feedback,
    phase,
    session: currentSession,
    signInWithSocial,
    socialAuthCapabilities,
  } = useAuth();

  return (
    <>
      <Text testID="phase">{phase}</Text>
      <Text testID="feedback">{feedback?.message ?? ''}</Text>
      <Text testID="access-token">{currentSession?.access_token ?? ''}</Text>
      <Text testID="google-enabled">
        {socialAuthCapabilities.google ? 'yes' : 'no'}
      </Text>
      <Pressable onPress={() => void signInWithSocial('google')}>
        <Text>start google</Text>
      </Pressable>
      <Pressable
        onPress={() =>
          void consumeSocialAuthCallback(
            'keylorforge://auth/oauth#access_token=callback-access&refresh_token=callback-refresh',
          )
        }
      >
        <Text>consume social callback</Text>
      </Pressable>
    </>
  );
}

describe('AuthProvider social auth integration', () => {
  const originalGoogle = process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED = 'true';
  });

  afterAll(() => {
    process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED = originalGoogle;
  });

  it('launches Google without changing the signed-out session until callback', async () => {
    const { auth, client } = createClient();
    const { getByText, getByTestId } = await render(
      <AuthProvider client={client}>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('phase').props.children).toBe('signedOut');
    });
    expect(getByTestId('google-enabled').props.children).toBe('yes');

    await fireEvent.press(getByText('start google'));

    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'keylorforge://auth/oauth',
        skipBrowserRedirect: true,
      },
    });
    expect(mockOpenUrl).toHaveBeenCalledTimes(1);
    expect(getByTestId('phase').props.children).toBe('signedOut');
    expect(getByTestId('feedback').props.children).toBe('');
  });

  it('installs the callback into the same signed-in session contract', async () => {
    const { auth, client } = createClient();
    const { getByText, getByTestId } = await render(
      <AuthProvider client={client}>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('phase').props.children).toBe('signedOut');
    });

    await fireEvent.press(getByText('consume social callback'));

    await waitFor(() => {
      expect(getByTestId('phase').props.children).toBe('signedIn');
      expect(getByTestId('access-token').props.children).toBe(
        'social-access-token',
      );
    });
    expect(auth.setSession).toHaveBeenCalledWith({
      access_token: 'callback-access',
      refresh_token: 'callback-refresh',
    });
  });
});
