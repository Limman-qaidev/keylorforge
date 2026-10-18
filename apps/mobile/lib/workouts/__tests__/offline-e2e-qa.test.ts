import { requestApi } from '../../api/client';
import { openOfflineE2eWorkoutDatabase } from '../expo-sqlite-adapter';
import { beginFreeWorkout } from '../free-workout-flow';
import {
  createOfflineM3Qa,
  reconcileOfflineM3Qa,
} from '../offline-e2e-qa';
import type { StartSyncAccess } from '../start-session-sync';

jest.mock('../../api/client', () => ({
  getApiBaseUrl: jest.fn(() => 'http://127.0.0.1:8001'),
  requestApi: jest.fn(),
}));
jest.mock('../expo-sqlite-adapter', () => ({
  openOfflineE2eWorkoutDatabase: jest.fn(),
}));
jest.mock('../native-workout-platform', () => ({
  secureWorkoutIds: { newUuid: jest.fn() },
  deviceWorkoutClock: {
    now: jest.fn(() => new Date('2026-10-19T10:00:00.000Z')),
    timeZone: jest.fn(() => 'Europe/Madrid'),
  },
}));
jest.mock('../free-workout-flow', () => ({
  beginFreeWorkout: jest.fn(),
  recordFreeWorkoutSet: jest.fn(),
  endFreeWorkout: jest.fn(),
}));
jest.mock('../remote-e2e-qa', () => ({
  assertIsolatedM3Server: jest.fn(),
  verifyIsolatedM3Finished: jest.fn(),
}));
jest.mock('../local-finish-history', () => ({
  listLocalFinishedWorkouts: jest.fn(),
}));
jest.mock('../active-workout-overview', () => ({
  readActiveFreeWorkoutOverview: jest.fn(),
}));
jest.mock('../local-store', () => ({
  getActiveLocalWorkout: jest.fn(),
}));
jest.mock('../../exercises/catalog-api', () => ({
  listExercises: jest.fn(),
}));

const SUBJECT = 'b35c00d6-243c-4dea-a095-000000000132';

function access(): StartSyncAccess {
  return {
    currentAuthenticatedSubject: () => SUBJECT,
    acquireCurrentCredentials: async () => ({
      subject: SUBJECT,
      accessToken: 'fake-token',
    }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('strict offline M3 QA transport boundary', () => {
  it('refuses airplane mode when the backend is still reachable over USB', async () => {
    jest.mocked(requestApi).mockResolvedValueOnce({
      status: 200,
    } as Response);
    await expect(createOfflineM3Qa(access())).rejects.toThrow(
      'el backend sigue accesible',
    );
    expect(requestApi).toHaveBeenCalledWith('/health', {
      signal: expect.anything(),
    });
    expect(openOfflineE2eWorkoutDatabase).not.toHaveBeenCalled();
    expect(beginFreeWorkout).not.toHaveBeenCalled();
  });

  it('cannot create anything without a previously seeded exercise', async () => {
    jest.mocked(requestApi).mockRejectedValueOnce(new Error('no route to backend'));
    jest.mocked(openOfflineE2eWorkoutDatabase).mockResolvedValue({
      getFirstAsync: jest.fn().mockResolvedValue(null),
    } as never);

    await expect(createOfflineM3Qa(access())).rejects.toThrow(
      'primero prepara el ejercicio',
    );
    expect(requestApi).toHaveBeenCalledTimes(1);
    expect(beginFreeWorkout).not.toHaveBeenCalled();
  });

  it('never begins reconciliation without a completed local offline workout', async () => {
    const { assertIsolatedM3Server, verifyIsolatedM3Finished } =
      jest.requireMock('../remote-e2e-qa') as {
        assertIsolatedM3Server: jest.Mock;
        verifyIsolatedM3Finished: jest.Mock;
      };
    const { listLocalFinishedWorkouts } = jest.requireMock(
      '../local-finish-history',
    ) as { listLocalFinishedWorkouts: jest.Mock };
    jest.mocked(openOfflineE2eWorkoutDatabase).mockResolvedValue({} as never);
    listLocalFinishedWorkouts.mockResolvedValue([]);

    await expect(reconcileOfflineM3Qa(access())).rejects.toThrow(
      'falta una única sesión completada offline',
    );
    expect(assertIsolatedM3Server).toHaveBeenCalledWith(
      expect.anything(),
      SUBJECT,
    );
    expect(verifyIsolatedM3Finished).not.toHaveBeenCalled();
  });
});
