import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { getSupabaseClient } from '../../auth/supabase';
import { openLocalWorkoutDatabase } from '../expo-sqlite-adapter';
import { drainWorkoutSync } from '../workout-sync-coordinator';
import { useForegroundWorkoutSync } from '../workout-sync-foreground';

jest.mock('../../auth/supabase', () => ({ getSupabaseClient: jest.fn() }));
jest.mock('../expo-sqlite-adapter', () => ({
  openLocalWorkoutDatabase: jest.fn(),
}));
jest.mock('../workout-sync-coordinator', () => ({
  drainWorkoutSync: jest.fn(),
}));

const OWNER = 'a3dbf764-e0e3-41aa-9895-6e58eadfbb14';
const OTHER = 'e426dd13-344a-4b69-8920-cb014715c6c1';

describe('staged automatic foreground workout sync', () => {
  let foreground: ((state: AppStateStatus) => void) | undefined;
  let unsubscribe: jest.Mock;
  let appSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    unsubscribe = jest.fn();
    foreground = undefined;
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: 'active',
    });
    appSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, listener) => {
        foreground = listener as (state: AppStateStatus) => void;
        return { remove: unsubscribe };
      });
    jest
      .mocked(openLocalWorkoutDatabase)
      .mockResolvedValue(
        {} as Awaited<ReturnType<typeof openLocalWorkoutDatabase>>,
      );
    jest.mocked(drainWorkoutSync).mockResolvedValue({
      state: 'idle',
      acknowledged: 0,
    });
    jest.mocked(getSupabaseClient).mockReturnValue({
      auth: {
        getSession: jest.fn().mockResolvedValue({
          data: {
            session: {
              user: { id: OWNER },
              access_token: 'current-access-token',
            },
          },
          error: null,
        }),
      },
    } as unknown as ReturnType<typeof getSupabaseClient>);
  });

  afterEach(() => {
    appSpy.mockRestore();
  });

  it('automatically attempts sync on mount, foreground and a confirmed local action', async () => {
    const hook = await renderHook(() => useForegroundWorkoutSync(OWNER));
    await waitFor(() => {
      expect(drainWorkoutSync).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      foreground?.('active');
    });
    await waitFor(() => {
      expect(drainWorkoutSync).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      hook.result.current();
    });
    await waitFor(() => {
      expect(drainWorkoutSync).toHaveBeenCalledTimes(3);
    });

    const access = jest.mocked(drainWorkoutSync).mock.calls[0]![1];
    expect(await access.acquireCurrentCredentials()).toEqual({
      subject: OWNER,
      accessToken: 'current-access-token',
    });
    await act(async () => hook.unmount());
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(access.currentAuthenticatedSubject()).toBeNull();
    expect(await access.acquireCurrentCredentials()).toBeNull();
  });

  it('does not drain or acquire another account credentials after signout', async () => {
    const hook = await renderHook(
      ({ subject }: { subject: string | null }) =>
        useForegroundWorkoutSync(subject),
      { initialProps: { subject: null as string | null } },
    );
    expect(drainWorkoutSync).not.toHaveBeenCalled();
    await act(async () => hook.rerender({ subject: OWNER }));
    await waitFor(() => {
      expect(drainWorkoutSync).toHaveBeenCalledTimes(1);
    });
    const access = jest.mocked(drainWorkoutSync).mock.calls[0]![1];
    const session = jest.mocked(getSupabaseClient)().auth.getSession;
    jest.mocked(session).mockResolvedValue({
      data: {
        session: {
          user: { id: OTHER },
          access_token: 'foreign-token',
        },
      },
      error: null,
    } as Awaited<ReturnType<typeof session>>);
    expect(await access.acquireCurrentCredentials()).toBeNull();
    await act(async () => hook.rerender({ subject: null }));
    expect(access.currentAuthenticatedSubject()).toBeNull();
    expect(await access.acquireCurrentCredentials()).toBeNull();
    expect(unsubscribe).toHaveBeenCalled();
    hook.unmount();
  });
});
