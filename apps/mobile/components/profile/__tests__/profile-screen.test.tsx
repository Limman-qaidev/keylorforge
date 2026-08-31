import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

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

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { gcTime: Infinity, retry: false },
    },
  });
}

async function renderProfileScreen() {
  const queryClient = createTestQueryClient();
  const ui = () => (
    <QueryClientProvider client={queryClient}>
      <ProfileScreen />
    </QueryClientProvider>
  );
  const result = await render(ui());

  return {
    ...result,
    queryClient,
    rerenderProfile: () => result.rerender(ui()),
  };
}

function authValue(accessToken = 'current-token') {
  return {
    invalidateSession: jest.fn().mockResolvedValue(undefined),
    refreshSession: jest.fn().mockResolvedValue('refreshed-token'),
    session: {
      access_token: accessToken,
      user: { id: 'user-1' },
    },
  } as unknown as ReturnType<typeof useAuth>;
}

describe('ProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useAuth).mockReturnValue(authValue());
  });

  it('loads the server-backed display name using the current access token', async () => {
    jest.mocked(getCurrentProfile).mockResolvedValue(profile('Taylor'));

    const { findByDisplayValue } = await renderProfileScreen();

    expect(await findByDisplayValue('Taylor')).toBeTruthy();
    expect(getCurrentProfile).toHaveBeenCalledWith('current-token');
  });

  it('uses the persisted PATCH response to confirm a save without a second GET', async () => {
    jest.mocked(getCurrentProfile).mockResolvedValue(profile('Taylor'));
    jest.mocked(updateCurrentProfile).mockResolvedValue({
      ...profile('Jordan Server').profile,
    });
    const { findByDisplayValue, findByText, getByLabelText, getByText } =
      await renderProfileScreen();

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
    expect(getCurrentProfile).toHaveBeenCalledTimes(1);
  });

  it('preserves dirty input when the access token rotates or cached server data refreshes', async () => {
    jest.mocked(getCurrentProfile).mockResolvedValue(profile('Taylor'));
    const { getByLabelText, getByDisplayValue, queryClient, rerenderProfile } =
      await renderProfileScreen();

    await waitFor(() => {
      expect(getByDisplayValue('Taylor')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.changeText(getByLabelText('Display name'), 'Unsaved Name');
    });

    jest.mocked(useAuth).mockReturnValue(authValue('refreshed-access-token'));
    await rerenderProfile();

    await act(async () => {
      queryClient.setQueryData(
        ['current-profile', 'user-1'],
        profile('Server Refreshed'),
      );
    });

    await waitFor(() => {
      expect(getByDisplayValue('Unsaved Name')).toBeTruthy();
    });
    expect(getCurrentProfile).toHaveBeenCalledTimes(1);
  });
});
