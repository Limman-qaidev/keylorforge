import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { AccountDeletionScreen } from '@/components/account/account-deletion-screen';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  AccountDeletionApiError,
  deleteCurrentAccount,
} from '@/lib/account/account-api';

jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('@/lib/auth/auth-provider', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/account/account-api', () => ({
  ...jest.requireActual('@/lib/account/account-api'),
  deleteCurrentAccount: jest.fn(),
}));

function authValue(accessToken = 'current-token') {
  return {
    invalidateSession: jest.fn().mockResolvedValue(undefined),
    refreshSession: jest.fn().mockResolvedValue('refreshed-token'),
    session: { access_token: accessToken, user: { id: 'user-1' } },
  } as unknown as ReturnType<typeof useAuth>;
}

async function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const result = await render(
    <QueryClientProvider client={queryClient}>
      <AccountDeletionScreen />
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

describe('AccountDeletionScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useAuth).mockReturnValue(authValue());
  });

  it('requires a second destructive confirmation before sending DELETE /me', async () => {
    jest.mocked(deleteCurrentAccount).mockResolvedValue(undefined);
    const { getByRole, getByText } = await renderScreen();

    expect(deleteCurrentAccount).not.toHaveBeenCalled();
    await act(async () =>
      fireEvent.press(getByRole('button', { name: 'Delete account' })),
    );
    expect(deleteCurrentAccount).not.toHaveBeenCalled();
    await act(async () =>
      fireEvent.press(getByText('Permanently delete account')),
    );

    await waitFor(() => {
      expect(deleteCurrentAccount).toHaveBeenCalledWith('current-token');
    });
  });

  it('clears cached profile state and invalidates the local session after success', async () => {
    const auth = authValue();
    jest.mocked(useAuth).mockReturnValue(auth);
    jest.mocked(deleteCurrentAccount).mockResolvedValue(undefined);
    const { getByRole, getByText, queryClient } = await renderScreen();
    queryClient.setQueryData(['current-profile', 'user-1'], { profile: {} });

    await act(async () =>
      fireEvent.press(getByRole('button', { name: 'Delete account' })),
    );
    await act(async () =>
      fireEvent.press(getByText('Permanently delete account')),
    );

    await waitFor(() =>
      expect(auth.invalidateSession).toHaveBeenCalledTimes(1),
    );
    expect(
      queryClient.getQueryData(['current-profile', 'user-1']),
    ).toBeUndefined();
  });

  it('shows a retryable safe failure without ending the local session', async () => {
    const auth = authValue();
    jest.mocked(useAuth).mockReturnValue(auth);
    jest
      .mocked(deleteCurrentAccount)
      .mockRejectedValue(
        new AccountDeletionApiError(
          'server',
          'Account deletion could not be completed. Please try again.',
        ),
      );
    const { findByText, getByRole, getByText } = await renderScreen();

    await act(async () =>
      fireEvent.press(getByRole('button', { name: 'Delete account' })),
    );
    await act(async () =>
      fireEvent.press(getByText('Permanently delete account')),
    );

    expect(
      await findByText(
        'Account deletion could not be completed. Please try again.',
      ),
    ).toBeTruthy();
    expect(auth.invalidateSession).not.toHaveBeenCalled();
  });

  it('refreshes once and retries the authenticated deletion request', async () => {
    const auth = authValue('expired-token');
    jest.mocked(useAuth).mockReturnValue(auth);
    jest
      .mocked(deleteCurrentAccount)
      .mockRejectedValueOnce(
        new AccountDeletionApiError(
          'auth',
          'Your session has ended. Please sign in again.',
        ),
      )
      .mockResolvedValueOnce(undefined);
    const { getByRole, getByText } = await renderScreen();

    await act(async () =>
      fireEvent.press(getByRole('button', { name: 'Delete account' })),
    );
    await act(async () =>
      fireEvent.press(getByText('Permanently delete account')),
    );

    await waitFor(() => {
      expect(deleteCurrentAccount).toHaveBeenNthCalledWith(1, 'expired-token');
      expect(deleteCurrentAccount).toHaveBeenNthCalledWith(
        2,
        'refreshed-token',
      );
    });
  });
});
