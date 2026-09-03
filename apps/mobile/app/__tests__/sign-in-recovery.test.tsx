import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import SignInRoute from '../sign-in';
import { useAuth } from '@/lib/auth/auth-provider';
import { useLocalSearchParams } from 'expo-router';

const mockedUseAuth = jest.mocked(useAuth);
const mockedUseLocalSearchParams = jest.mocked(useLocalSearchParams);
const signIn = jest.fn();

jest.mock('@/lib/auth/auth-provider', () => ({ useAuth: jest.fn() }));

jest.mock('expo-router', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => {
    const { Text: MockText, View: MockView } =
      jest.requireActual('react-native');

    return (
      <MockView testID={`link:${href}`}>
        <MockText>{href}</MockText>
        {children}
      </MockView>
    );
  },
  Redirect: ({ href }: { href: string }) => {
    const { Text: MockText } = jest.requireActual('react-native');

    return <MockText testID="redirect">{href}</MockText>;
  },
  useLocalSearchParams: jest.fn(),
}));

describe('SignInRoute recovery entry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseLocalSearchParams.mockReturnValue({ passwordUpdated: 'true' });
    mockedUseAuth.mockReturnValue({
      confirmationEmail: null,
      feedback: null,
      phase: 'signedOut',
      session: null,
      signIn,
    } as unknown as ReturnType<typeof useAuth>);
  });

  it('exposes password recovery and confirms a completed password update', async () => {
    const view = await render(<SignInRoute />);

    expect(
      view.getByText('Password updated. Sign in with your new password.'),
    ).toBeTruthy();
    expect(view.getByTestId('link:/password-recovery')).toBeTruthy();
    expect(view.getByText('/password-recovery')).toBeTruthy();
    expect(view.queryByTestId('redirect')).toBeNull();
  });
});
