import { act, fireEvent, render } from '@testing-library/react-native';

import { ProfileScreen } from '@/components/profile/profile-screen';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  getCurrentProfile,
  updateCurrentProfile,
} from '@/lib/profile/profile-api';

jest.mock('@/lib/auth/auth-provider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/profile/profile-api', () => ({
  ...jest.requireActual('@/lib/profile/profile-api'),
  getCurrentProfile: jest.fn(),
  updateCurrentProfile: jest.fn(),
}));

const profile = (displayName: string | null) => ({
  id: 'b1f4d587-4eef-4af8-899b-b2173ee42de0',
  profile: {
    created_at: '2026-08-31T10:00:00Z',
    display_name: displayName,
    updated_at: '2026-08-31T10:00:00Z',
  },
});

describe('ProfileScreen', () => {
  const signOut = jest.fn().mockResolvedValue({});

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useAuth).mockReturnValue({
      session: { access_token: 'current-token' },
      signOut,
    } as unknown as ReturnType<typeof useAuth>);
  });

  it('loads the server-backed display name using the current access token', async () => {
    jest.mocked(getCurrentProfile).mockResolvedValue(profile('Taylor'));

    const { findByDisplayValue } = await render(<ProfileScreen />);

    expect(await findByDisplayValue('Taylor')).toBeTruthy();
    expect(getCurrentProfile).toHaveBeenCalledWith('current-token');
  });

  it('saves then reloads the persisted server value before confirming success', async () => {
    jest
      .mocked(getCurrentProfile)
      .mockResolvedValueOnce(profile('Taylor'))
      .mockResolvedValueOnce(profile('Jordan Server'));
    jest.mocked(updateCurrentProfile).mockResolvedValue({
      ...profile('Jordan').profile,
    });
    const { findByDisplayValue, findByText, getByLabelText, getByText } =
      await render(<ProfileScreen />);

    await findByDisplayValue('Taylor');
    await act(async () => {
      fireEvent.changeText(getByLabelText('Display name'), 'Jordan');
    });
    await act(async () => {
      fireEvent.press(getByText('Save profile'));
    });

    expect(await findByText('Profile saved.')).toBeTruthy();
    expect(await findByDisplayValue('Jordan Server')).toBeTruthy();
    expect(updateCurrentProfile).toHaveBeenCalledWith(
      'current-token',
      'Jordan',
    );
    expect(getCurrentProfile).toHaveBeenCalledTimes(2);
  });
});
