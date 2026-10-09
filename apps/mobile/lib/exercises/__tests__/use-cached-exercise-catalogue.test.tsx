import { act, render, waitFor } from '@testing-library/react-native';
import type { Session } from '@supabase/supabase-js';
import { AppState, type AppStateStatus, Text } from 'react-native';

import {
  offlineCatalogueStatus,
  searchOfflineExercises,
  seedOfflineCatalogueFromApi,
} from '@/lib/exercises/offline-catalogue';
import { openOfflineExerciseCatalogue } from '@/lib/exercises/offline-catalogue-adapter';
import { useCachedExerciseCatalogue } from '@/lib/exercises/use-cached-exercise-catalogue';

jest.mock('@/lib/exercises/offline-catalogue', () => ({
  offlineCatalogueStatus: jest.fn(),
  searchOfflineExercises: jest.fn(),
  seedOfflineCatalogueFromApi: jest.fn(),
}));
jest.mock('@/lib/exercises/offline-catalogue-adapter', () => ({
  openOfflineExerciseCatalogue: jest.fn(),
}));

const subject = 'b35c00d6-243c-4dea-a095-000000000100';
const currentSession = {
  access_token: 'verified-token',
  user: { id: subject },
} as Session;
const cachedExercise = {
  id: '1e4b7e29-6600-4bb3-b4f1-3d9f494426a9',
  name: 'Abdominal Otis',
  measurement_type: 'reps',
  category: null,
  difficulty_level: null,
  primary_muscles: [
    { id: '0036423d-9d71-4d40-8ca7-661bcaad974c', name: 'Abdominales' },
  ],
  equipment: [],
  alias_ids: [],
};

function TestScreen() {
  const { snapshot, initialized } = useCachedExerciseCatalogue(currentSession);
  return (
    <Text>
      {!initialized
        ? 'Buscando catálogo'
        : snapshot
          ? snapshot.items.map((item) => item.name).join(',')
          : 'Catálogo online disponible'}
    </Text>
  );
}

describe('transparent native exercise catalogue persistence', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(openOfflineExerciseCatalogue)
      .mockResolvedValue(
        {} as Awaited<ReturnType<typeof openOfflineExerciseCatalogue>>,
      );
    jest.mocked(offlineCatalogueStatus).mockResolvedValue({
      state: 'ready',
      total: 1,
      seededAtUtc: new Date().toISOString(),
    });
    jest.mocked(searchOfflineExercises).mockResolvedValue({
      total: 1,
      items: [cachedExercise],
    });
    jest.mocked(seedOfflineCatalogueFromApi).mockResolvedValue({
      state: 'ready',
      total: 1,
      seededAtUtc: new Date().toISOString(),
    });
  });

  it('reads a complete persisted SQLite snapshot with no network call', async () => {
    const screen = await render(<TestScreen />);
    expect(await screen.findByText('Abdominal Otis')).toBeTruthy();
    expect(seedOfflineCatalogueFromApi).not.toHaveBeenCalled();
    expect(searchOfflineExercises).toHaveBeenCalledWith(expect.anything(), {
      offset: 0,
      limit: 100,
    });
  });

  it('opens the same SQLite cache after a normal component relaunch', async () => {
    const first = await render(<TestScreen />);
    await first.findByText('Abdominal Otis');
    await first.unmount();
    const next = await render(<TestScreen />);
    expect(await next.findByText('Abdominal Otis')).toBeTruthy();
    expect(seedOfflineCatalogueFromApi).not.toHaveBeenCalled();
  });

  it('automatically boots a missing cache without a special download button', async () => {
    jest
      .mocked(offlineCatalogueStatus)
      .mockResolvedValueOnce({ state: 'unseeded' })
      .mockResolvedValue({
        state: 'ready',
        total: 1,
        seededAtUtc: new Date().toISOString(),
      });

    const screen = await render(<TestScreen />);
    await waitFor(() => {
      expect(seedOfflineCatalogueFromApi).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('Abdominal Otis')).toBeTruthy();
    const auth = jest.mocked(seedOfflineCatalogueFromApi).mock.calls[0]![1];
    expect(auth.currentAuthenticatedSubject()).toBe(subject);
    expect(await auth.acquireCurrentCredentials()).toEqual({
      subject,
      accessToken: 'verified-token',
    });
  });

  it('keeps a prior complete cache after automatic refresh fails', async () => {
    jest.mocked(offlineCatalogueStatus).mockResolvedValue({
      state: 'ready',
      total: 1,
      seededAtUtc: '2024-01-01T00:00:00.000Z',
    });
    jest
      .mocked(seedOfflineCatalogueFromApi)
      .mockRejectedValue(new Error('airplane mode'));
    const screen = await render(<TestScreen />);
    expect(await screen.findByText('Abdominal Otis')).toBeTruthy();
    await waitFor(() =>
      expect(seedOfflineCatalogueFromApi).toHaveBeenCalledTimes(1),
    );
    expect(screen.getByText('Abdominal Otis')).toBeTruthy();
  });

  it('retains the online first-use fallback when no SQLite cache can be seeded', async () => {
    jest.mocked(offlineCatalogueStatus).mockResolvedValue({
      state: 'unseeded',
    });
    jest
      .mocked(seedOfflineCatalogueFromApi)
      .mockRejectedValue(new Error('not connected'));
    const screen = await render(<TestScreen />);
    expect(await screen.findByText('Catálogo online disponible')).toBeTruthy();
    await waitFor(() =>
      expect(seedOfflineCatalogueFromApi).toHaveBeenCalledTimes(1),
    );
  });
  it('retries a failed stale refresh automatically on foreground and retains the visible catalogue', async () => {
    let nowMs = Date.parse('2026-10-09T12:00:00.000Z');
    jest.spyOn(Date, 'now').mockImplementation(() => nowMs);

    let onAppStateChange: ((state: AppStateStatus) => void) | null = null;
    const removeListener = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      onAppStateChange = listener as (state: AppStateStatus) => void;
      return { remove: removeListener };
    });

    let seededAtUtc = '2024-01-01T00:00:00.000Z';
    jest.mocked(offlineCatalogueStatus).mockImplementation(async () => ({
      state: 'ready',
      total: 1,
      seededAtUtc,
    }));
    jest.mocked(seedOfflineCatalogueFromApi)
      .mockRejectedValueOnce(new Error('temporarily offline'))
      .mockImplementationOnce(async () => {
        seededAtUtc = new Date(nowMs).toISOString();
        return { state: 'ready', total: 1, seededAtUtc };
      });

    const screen = await render(<TestScreen />);
    expect(await screen.findByText('Abdominal Otis')).toBeTruthy();
    await waitFor(() =>
      expect(seedOfflineCatalogueFromApi).toHaveBeenCalledTimes(1),
    );
    expect(screen.getByText('Abdominal Otis')).toBeTruthy();

    // A connection can return while the screen stays mounted: AppState
    // foreground notification retries after the bounded failure cooldown.
    nowMs += 61_000;
    await act(async () => {
      onAppStateChange?.('active');
    });
    await waitFor(() =>
      expect(seedOfflineCatalogueFromApi).toHaveBeenCalledTimes(2),
    );
    expect(screen.getByText('Abdominal Otis')).toBeTruthy();

    // A fresh snapshot prevents repeated downloads on subsequent resumes.
    await act(async () => {
      onAppStateChange?.('active');
    });
    expect(seedOfflineCatalogueFromApi).toHaveBeenCalledTimes(2);
    await screen.unmount();
    expect(removeListener).toHaveBeenCalled();
  });

});
