import { requestApi } from '@/lib/api/client';
import {
  getCurrentProfile,
  ProfileApiError,
  updateCurrentProfile,
} from '@/lib/profile/profile-api';

jest.mock('@/lib/api/client', () => ({
  requestApi: jest.fn(),
}));

const currentProfile = {
  id: 'b1f4d587-4eef-4af8-899b-b2173ee42de0',
  profile: {
    created_at: '2026-08-31T10:00:00Z',
    display_name: 'Taylor',
    updated_at: '2026-08-31T10:00:00Z',
  },
};

describe('profile API client', () => {
  beforeEach(() => {
    jest.mocked(requestApi).mockReset();
  });

  it('fetches only the current caller profile with their bearer token', async () => {
    jest.mocked(requestApi).mockResolvedValue({
      json: async () => currentProfile,
      ok: true,
      status: 200,
    } as Response);

    await expect(getCurrentProfile('current-token')).resolves.toEqual(
      currentProfile,
    );
    expect(requestApi).toHaveBeenCalledWith('/me', {
      headers: { Authorization: 'Bearer current-token' },
    });
  });

  it('updates only display_name and accepts the PATCH profile response', async () => {
    const updatedProfile = {
      ...currentProfile.profile,
      display_name: 'Jordan',
    };
    jest.mocked(requestApi).mockResolvedValue({
      json: async () => updatedProfile,
      ok: true,
      status: 200,
    } as Response);

    await expect(
      updateCurrentProfile('current-token', 'Jordan'),
    ).resolves.toEqual(updatedProfile);
    expect(requestApi).toHaveBeenCalledWith('/me/profile', {
      body: JSON.stringify({ display_name: 'Jordan' }),
      headers: {
        Authorization: 'Bearer current-token',
        'Content-Type': 'application/json',
      },
      method: 'PATCH',
    });
  });

  it.each([
    [401, 'auth', 'Your session has ended. Please sign in again.'],
    [403, 'forbidden', 'You are not authorized to access this profile.'],
    [
      503,
      'server',
      'The profile service is temporarily unavailable. Please try again.',
    ],
  ] as const)('classifies HTTP %i safely', async (status, kind, message) => {
    jest.mocked(requestApi).mockResolvedValue({
      json: async () => ({ detail: 'not shown to the user' }),
      ok: false,
      status,
    } as Response);

    await expect(getCurrentProfile('current-token')).rejects.toMatchObject({
      kind,
      message,
    } satisfies Partial<ProfileApiError>);
  });

  it('reports connection failures without treating them as a successful save', async () => {
    jest.mocked(requestApi).mockRejectedValue(new TypeError('network failed'));

    await expect(
      updateCurrentProfile('current-token', 'Jordan'),
    ).rejects.toMatchObject({
      kind: 'network',
      message:
        'We could not save your profile. Check your connection and try again.',
    } satisfies Partial<ProfileApiError>);
  });
});
