import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import type { Session } from '@supabase/supabase-js';

import { RequireAuthenticated, RequireSignedOut } from '../auth-guards';
import { AuthProvider } from '@/lib/auth/auth-provider';
import type { MobileSupabaseClient } from '@/lib/auth/supabase';

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text: MockText } = jest.requireActual('react-native');
    return <MockText testID="redirect">{href}</MockText>;
  },
}));

function clientFor(session: Session | null): MobileSupabaseClient {
  return {
    auth: {
      getSession: jest
        .fn()
        .mockResolvedValue({ data: { session }, error: null }),
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
    },
  } as unknown as MobileSupabaseClient;
}

describe('auth route guards', () => {
  it('does not render a protected child before session restoration completes', async () => {
    const pendingClient = {
      auth: {
        getSession: jest.fn(() => new Promise(() => undefined)),
        onAuthStateChange: jest.fn().mockReturnValue({
          data: { subscription: { unsubscribe: jest.fn() } },
        }),
        startAutoRefresh: jest.fn(),
        stopAutoRefresh: jest.fn(),
      },
    } as unknown as MobileSupabaseClient;
    const { getByTestId, queryByText } = await render(
      <AuthProvider client={pendingClient}>
        <RequireAuthenticated>
          <Text>protected home</Text>
        </RequireAuthenticated>
      </AuthProvider>,
    );

    expect(getByTestId('redirect').props.children).toBe('/restoring');
    expect(queryByText('protected home')).toBeNull();
  });

  it('redirects a signed-out visitor away from protected UI', async () => {
    const { findByTestId } = await render(
      <AuthProvider client={clientFor(null)}>
        <RequireAuthenticated>
          <Text>protected home</Text>
        </RequireAuthenticated>
      </AuthProvider>,
    );

    expect((await findByTestId('redirect')).props.children).toBe('/welcome');
  });

  it('redirects a signed-in visitor away from signed-out UI', async () => {
    const signedIn = { access_token: 'a' } as Session;
    const { findByTestId } = await render(
      <AuthProvider client={clientFor(signedIn)}>
        <RequireSignedOut>
          <Text>welcome</Text>
        </RequireSignedOut>
      </AuthProvider>,
    );

    expect((await findByTestId('redirect')).props.children).toBe('/home');
  });
});
