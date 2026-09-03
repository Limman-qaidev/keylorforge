import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import RecoveryCallbackRoute from '../recovery';
import { useAuth } from '@/lib/auth/auth-provider';
import { useRecoveryLink } from '@/lib/auth/recovery-link-provider';

const mockReplace = jest.fn();
const clearRecoveryLink = jest.fn();
const consumeRecoveryCallback = jest.fn();
const invalidateSession = jest.fn();
const updateRecoveryPassword = jest.fn();
const mockedUseAuth = jest.mocked(useAuth);
const mockedUseRecoveryLink = jest.mocked(useRecoveryLink);

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('@/lib/auth/auth-provider', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/auth/recovery-link-provider', () => ({
  useRecoveryLink: jest.fn(),
}));

describe('RecoveryCallbackRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidateSession.mockResolvedValue(undefined);
    mockedUseRecoveryLink.mockReturnValue({
      clearRecoveryLink,
      recoveryUrl:
        'keylorforge://auth/recovery#access_token=access-token&refresh_token=refresh-token&type=recovery',
    });
    updateRecoveryPassword.mockResolvedValue({});
  });

  it('consumes a newer recovery link retained above the route', async () => {
    consumeRecoveryCallback.mockResolvedValue({});
    mockedUseAuth.mockReturnValue({
      consumeRecoveryCallback,
      invalidateSession,
      phase: 'signedOut',
      updateRecoveryPassword,
    } as unknown as ReturnType<typeof useAuth>);

    const view = await render(<RecoveryCallbackRoute />);

    await waitFor(() => {
      expect(consumeRecoveryCallback).toHaveBeenCalledWith(
        'keylorforge://auth/recovery#access_token=access-token&refresh_token=refresh-token&type=recovery',
      );
      expect(clearRecoveryLink).toHaveBeenCalledWith(
        'keylorforge://auth/recovery#access_token=access-token&refresh_token=refresh-token&type=recovery',
      );
    });

    mockedUseRecoveryLink.mockReturnValue({
      clearRecoveryLink,
      recoveryUrl:
        'keylorforge://auth/recovery#access_token=second-access-token&refresh_token=second-refresh-token&type=recovery',
    });
    await view.rerender(<RecoveryCallbackRoute />);

    await waitFor(() => {
      expect(consumeRecoveryCallback).toHaveBeenCalledTimes(2);
      expect(consumeRecoveryCallback).toHaveBeenLastCalledWith(
        'keylorforge://auth/recovery#access_token=second-access-token&refresh_token=second-refresh-token&type=recovery',
      );
    });
  });

  it('shows a safe callback failure and lets the user request another email', async () => {
    consumeRecoveryCallback.mockResolvedValue({
      error:
        'This recovery link is no longer valid. Request a new recovery email and try again.',
    });
    mockedUseAuth.mockReturnValue({
      consumeRecoveryCallback,
      invalidateSession,
      phase: 'signedOut',
      updateRecoveryPassword,
    } as unknown as ReturnType<typeof useAuth>);

    const view = await render(<RecoveryCallbackRoute />);

    await waitFor(() => {
      expect(consumeRecoveryCallback).toHaveBeenCalledTimes(1);
    });
    expect(
      await view.findByText(
        'This recovery link is no longer valid. Request a new recovery email and try again.',
      ),
    ).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByText('Request a new recovery email'));
    });
    expect(mockReplace).toHaveBeenCalledWith('/password-recovery');
  });

  it('validates matching passwords and returns to sign in after a successful update', async () => {
    consumeRecoveryCallback.mockResolvedValue({});
    mockedUseAuth.mockReturnValue({
      consumeRecoveryCallback,
      invalidateSession,
      phase: 'recovery',
      updateRecoveryPassword,
    } as unknown as ReturnType<typeof useAuth>);

    const view = await render(<RecoveryCallbackRoute />);

    await act(async () => {
      fireEvent.changeText(view.getByLabelText('New password'), 'password123');
    });
    await act(async () => {
      fireEvent.changeText(
        view.getByLabelText('Confirm new password'),
        'different123',
      );
    });
    await act(async () => {
      fireEvent.press(view.getByText('Update password'));
    });

    expect(await view.findByText('Passwords do not match.')).toBeTruthy();
    expect(updateRecoveryPassword).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.changeText(
        view.getByLabelText('Confirm new password'),
        'password123',
      );
    });
    await waitFor(() => {
      expect(view.getAllByDisplayValue('password123')).toHaveLength(2);
    });
    await act(async () => {
      fireEvent.press(view.getByText('Update password'));
    });

    await waitFor(() => {
      expect(updateRecoveryPassword).toHaveBeenCalledWith('password123');
      expect(mockReplace).toHaveBeenCalledWith({
        params: { passwordUpdated: 'true' },
        pathname: '/sign-in',
      });
    });
  });

  it('lets the user abandon a persisted recovery session safely', async () => {
    mockedUseAuth.mockReturnValue({
      consumeRecoveryCallback,
      invalidateSession,
      phase: 'recovery',
      updateRecoveryPassword,
    } as unknown as ReturnType<typeof useAuth>);

    const view = await render(<RecoveryCallbackRoute />);

    await act(async () => {
      fireEvent.press(view.getByText('Cancel recovery and return to sign in'));
    });

    expect(invalidateSession).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/sign-in');
  });
});
