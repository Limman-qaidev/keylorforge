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

describe('ProfileScreen terminal authentication failure', () => {
  it('uses AuthProvider session invalidation after a 401 response', async () => {
    const invalidateSession = jest.fn().mockResolvedValue(undefined);
    jest.mocked(useAuth).mockReturnValue({
      invalidateSession,
      session: { access_token: 'current-token' },
    } as unknown as ReturnType<typeof useAuth>);
    jest
      .mocked(getCurrentProfile)
      .mockRejectedValue(
        new ProfileApiError(
          'auth',
          'Your session has ended. Please sign in again.',
        ),
      );

    await render(<ProfileScreen />);

    await waitFor(() => {
      expect(invalidateSession).toHaveBeenCalledTimes(1);
    });
  });
});
