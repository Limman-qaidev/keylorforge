import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

import ConfirmationRoute from '../confirmation';
import { AuthProvider, useAuth } from '@/lib/auth/auth-provider';
import type { MobileSupabaseClient } from '@/lib/auth/supabase';

jest.mock('expo-router', () => ({
  Link: ({
    children,
    href,
    onPress,
  }: {
    children: ReactNode;
    href: string;
    onPress?: () => void;
  }) => {
    const { Pressable: MockPressable, Text: MockText } =
      jest.requireActual('react-native');

    return (
      <MockPressable onPress={onPress} testID="confirmation-link">
        <MockText>{href}</MockText>
        {children}
      </MockPressable>
    );
  },
  Redirect: ({ href }: { href: string }) => {
    const { Text: MockText } = jest.requireActual('react-native');

    return <MockText testID="redirect">{href}</MockText>;
  },
}));

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

function confirmationClient(
  initialSession: Session | null = null,
): MobileSupabaseClient {
  return {
    auth: {
      getSession: jest
        .fn()
        .mockResolvedValue({ data: { session: initialSession }, error: null }),
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
      signUp: jest.fn().mockResolvedValue({
        data: { session: null },
        error: null,
      }),
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
    },
  } as unknown as MobileSupabaseClient;
}

function StartConfirmation() {
  const { signUp } = useAuth();

  return (
    <Pressable
      onPress={() => void signUp('pending@example.com', 'password123')}
    >
      <Text>start confirmation</Text>
    </Pressable>
  );
}

describe('ConfirmationRoute', () => {
  it('renders a pending confirmation instead of redirecting to itself', async () => {
    const { findByText, getByTestId, getByText, queryByTestId } = await render(
      <AuthProvider client={confirmationClient()}>
        <StartConfirmation />
        <ConfirmationRoute />
      </AuthProvider>,
    );

    await act(async () => {
      fireEvent.press(await findByText('start confirmation'));
    });

    await waitFor(() => {
      expect(getByTestId('confirmation-link')).toBeTruthy();
      expect(queryByTestId('redirect')).toBeNull();
    });
    expect(await findByText('/sign-in')).toBeTruthy();
    expect(await findByText('pending@example.com')).toBeTruthy();
    expect(await findByText('CONFIRM YOUR EMAIL')).toBeTruthy();

    fireEvent.press(getByTestId('confirmation-link'));
    await waitFor(() => {
      expect(getByText('Check your inbox')).toBeTruthy();
    });
  });

  it('redirects a signed-in visitor away from the confirmation route', async () => {
    const { findByTestId, queryByText } = await render(
      <AuthProvider client={confirmationClient(session())}>
        <ConfirmationRoute />
      </AuthProvider>,
    );

    expect((await findByTestId('redirect')).props.children).toBe('/home');
    expect(queryByText('Check your email')).toBeNull();
  });
});
