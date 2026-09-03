import { fireEvent, render, waitFor } from '@testing-library/react-native';

import RecoveryCallbackRoute from '../recovery';
import { useAuth } from '@/lib/auth/auth-provider';
import { useLinkingURL } from 'expo-linking';

const mockReplace = jest.fn();
const consumeRecoveryCallback = jest.fn();
const updateRecoveryPassword = jest.fn();
const mockedUseAuth = jest.mocked(useAuth);
const mockedUseLinkingURL = jest.mocked(useLinkingURL);

jest.mock('expo-linking', () => ({ useLinkingURL: jest.fn() }));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('@/lib/auth/auth-provider', () => ({ useAuth: jest.fn() }));

describe('RecoveryCallbackRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseLinkingURL.mockReturnValue(
      'keylorforge://auth/recovery#access_token=access-token&refresh_token=refresh-token&type=recovery',
    );
    updateRecoveryPassword.mockResolvedValue({});
  });

  it('shows a safe callback failure and lets the user request another email', async () => {
    consumeRecoveryCallback.mockResolvedValue({
      error:
        'This recovery link is no longer valid. Request a new recovery email and try again.',
    });
    mockedUseAuth.mockReturnValue({
      consumeRecoveryCallback,
      phase: 'signedOut',
      updateRecoveryPassword,
    } as unknown as ReturnType<typeof useAuth>);

    const view = render(<RecoveryCallbackRoute />);

    await waitFor(() => {
      expect(consumeRecoveryCallback).toHaveBeenCalledTimes(1);
    });
    expect(
      await view.findByText(
        'This recovery link is no longer valid. Request a new recovery email and try again.',
      ),
    ).toBeTruthy();

    fireEvent.press(view.getByText('Request a new recovery email'));
    expect(mockReplace).toHaveBeenCalledWith('/password-recovery');
  });

  it('validates matching passwords and returns to sign in after a successful update', async () => {
    consumeRecoveryCallback.mockResolvedValue({});
    mockedUseAuth.mockReturnValue({
      consumeRecoveryCallback,
      phase: 'recovery',
      updateRecoveryPassword,
    } as unknown as ReturnType<typeof useAuth>);

    const view = render(<RecoveryCallbackRoute />);

    fireEvent.changeText(view.getByLabelText('New password'), 'password123');
    fireEvent.changeText(
      view.getByLabelText('Confirm new password'),
      'different123',
    );
    fireEvent.press(view.getByText('Update password'));

    expect(await view.findByText('Passwords do not match.')).toBeTruthy();
    expect(updateRecoveryPassword).not.toHaveBeenCalled();

    fireEvent.changeText(
      view.getByLabelText('Confirm new password'),
      'password123',
    );
    fireEvent.press(view.getByText('Update password'));

    await waitFor(() => {
      expect(updateRecoveryPassword).toHaveBeenCalledWith('password123');
      expect(mockReplace).toHaveBeenCalledWith({
        params: { passwordUpdated: 'true' },
        pathname: '/sign-in',
      });
    });
  });
});
