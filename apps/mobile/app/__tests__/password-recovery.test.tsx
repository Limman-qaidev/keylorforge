import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import PasswordRecoveryRoute from '../password-recovery';
import { useAuth } from '@/lib/auth/auth-provider';

const requestPasswordRecovery = jest.fn();
const mockedUseAuth = jest.mocked(useAuth);

jest.mock('@/lib/auth/auth-provider', () => ({ useAuth: jest.fn() }));

jest.mock('expo-router', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => {
    const { Text: MockText, View: MockView } =
      jest.requireActual('react-native');

    return (
      <MockView>
        <MockText>{href}</MockText>
        {children}
      </MockView>
    );
  },
  Redirect: ({ href }: { href: string }) => {
    const { Text: MockText } = jest.requireActual('react-native');

    return <MockText testID="redirect">{href}</MockText>;
  },
}));

describe('PasswordRecoveryRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requestPasswordRecovery.mockResolvedValue({});
    mockedUseAuth.mockReturnValue({
      confirmationEmail: null,
      feedback: null,
      phase: 'signedOut',
      requestPasswordRecovery,
      session: null,
    } as unknown as ReturnType<typeof useAuth>);
  });

  it('validates the email, then submits without revealing account existence', async () => {
    const view = await render(<PasswordRecoveryRoute />);

    fireEvent.changeText(view.getByLabelText('Email'), 'not-an-email');
    fireEvent.press(view.getByText('Send recovery link'));

    expect(await view.findByText('Enter a valid email address.')).toBeTruthy();
    expect(requestPasswordRecovery).not.toHaveBeenCalled();

    fireEvent.changeText(view.getByLabelText('Email'), 'person@example.com');
    fireEvent.press(view.getByText('Send recovery link'));

    await waitFor(() => {
      expect(requestPasswordRecovery).toHaveBeenCalledWith(
        'person@example.com',
      );
    });
    expect(
      await view.findByText(
        'If an account matches that email address, we sent a password recovery link. Open it on this device.',
      ),
    ).toBeTruthy();
    expect(view.queryByTestId('redirect')).toBeNull();
  });
});
