import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';

import { ProfileScreen } from '@/components/profile/profile-screen';
import { useAuth } from '@/lib/auth/auth-provider';
import { getCurrentProfile, ProfileApiError } from '@/lib/profile/profile-api';

jest.mock('@/lib/auth/auth-provider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/profile/profile-api', () => ({
  ...jest.requireActual('@/lib/profile/profile-api'),
  getCurrentProfile: jest.fn(),
}));

const currentProfile = {
  id: 'b1f4d587-4eef-4af8-899b-b2173ee42de0',
  profile: {
    created_at: '2026-08-31T10:00:00Z',
    display_name: 'Taylor',
    updated_at: '2026-08-31T10:00:00Z',
  },
};

function authError() {
  return new ProfileApiError(
    'auth',
    'Your session has ended. Please sign in again.',
  );
}

function renderProfileScreen() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { gcTime: Infinity, retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ProfileScreen />
    </QueryClientProvider>,
  );
}

describe('ProfileScreen protected API authentication recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refreshes once and retries a 401 before ending the session', async () => {
    const invalidateSession = jest.fn().mockResolvedValue(undefined);
    const refreshSession = jest.fn().mockResolvedValue('fresh-token');
    jest.mocked(useAuth).mockReturnValue({
      invalidateSession,
      refreshSession,
      session: {
        access_token: 'expired-token',
        user: { id: 'user-1' },
      },
    } as unknown as ReturnType<typeof useAuth>);
    jest
      .mocked(getCurrentProfile)
      .mockRejectedValueOnce(authError())
      .mockResolvedValueOnce(currentProfile);

    const { findByDisplayValue } = renderProfileScreen();

    expect(await findByDisplayValue('Taylor')).toBeTruthy();
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(getCurrentProfile).toHaveBeenNthCalledWith(1, 'expired-token');
    expect(getCurrentProfile).toHaveBeenNthCalledWith(2, 'fresh-token');
    expect(invalidateSession).not.toHaveBeenCalled();
  });

  it('invalidates locally only when the refreshed token is also rejected', async () => {
    const invalidateSession = jest.fn().mockResolvedValue(undefined);
    const refreshSession = jest.fn().mockResolvedValue('fresh-token');
    jest.mocked(useAuth).mockReturnValue({
      invalidateSession,
      refreshSession,
      session: {
        access_token: 'expired-token',
        user: { id: 'user-1' },
      },
    } as unknown as ReturnType<typeof useAuth>);
    jest.mocked(getCurrentProfile).mockRejectedValue(authError());

    renderProfileScreen();

    await waitFor(() => {
      expect(invalidateSession).toHaveBeenCalledTimes(1);
    });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(getCurrentProfile).toHaveBeenCalledTimes(2);
  });

  it('keeps the current session on a transient refresh failure', async () => {
    const invalidateSession = jest.fn().mockResolvedValue(undefined);
    const refreshSession = jest
      .fn()
      .mockRejectedValue(new Error('network unavailable'));
    jest.mocked(useAuth).mockReturnValue({
      invalidateSession,
      refreshSession,
      session: {
        access_token: 'expired-token',
        user: { id: 'user-1' },
      },
    } as unknown as ReturnType<typeof useAuth>);
    jest.mocked(getCurrentProfile).mockRejectedValueOnce(authError());

    const { findByText } = renderProfileScreen();

    expect(
      await findByText(
        'We could not refresh your session. Check your connection and try again.',
      ),
    ).toBeTruthy();
    expect(invalidateSession).not.toHaveBeenCalled();
  });

  it('does not double-invalidate when refreshSession already ends a terminal session', async () => {
    const invalidateSession = jest.fn().mockResolvedValue(undefined);
    const refreshSession = jest.fn().mockResolvedValue(null);
    jest.mocked(useAuth).mockReturnValue({
      invalidateSession,
      refreshSession,
      session: {
        access_token: 'expired-token',
        user: { id: 'user-1' },
      },
    } as unknown as ReturnType<typeof useAuth>);
    jest.mocked(getCurrentProfile).mockRejectedValueOnce(authError());

    const { findByText } = renderProfileScreen();

    expect(
      await findByText('Your session has ended. Please sign in again.'),
    ).toBeTruthy();
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(invalidateSession).not.toHaveBeenCalled();
  });
});
