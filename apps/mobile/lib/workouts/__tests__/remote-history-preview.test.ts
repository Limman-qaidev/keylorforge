import { requestApi } from '../../api/client';
import { auditCompletedWorkoutHistory } from '../workout-history-audit';
import { previewRemoteOnlyWorkout } from '../remote-history-preview';
import type { SqliteWorkoutPort } from '../local-schema';
import type { StartSyncAccess } from '../start-session-sync';

jest.mock('../../api/client', () => ({ requestApi: jest.fn() }));
jest.mock('../workout-history-audit', () => ({
  auditCompletedWorkoutHistory: jest.fn(),
}));

const OWNER = 'a3dbf764-e0e3-41aa-9895-6e58eadfbb14';
const OTHER = 'e426dd13-344a-4b69-8920-cb014715c6c1';
const SESSION = '1f2d27bc-4904-4f4f-9367-39565d78f211';
const SNAPSHOT = '17e1a62d-965f-4caf-a509-c95ab2fe6438';
const OCCURRENCE = 'c226a777-d460-4d5f-bad6-f75667a9d022';
const SET = '1b428bd6-781d-44ec-8609-57af594a5511';
const EXERCISE = '502c4c87-80a5-4567-9aaf-296e43bfc4d1';

function credentials() {
  let subject: string | null = OWNER;
  return {
    access: {
      currentAuthenticatedSubject: () => subject,
      acquireCurrentCredentials: async () => ({
        subject: OWNER,
        accessToken: 'in-memory-auth-only',
      }),
    } satisfies StartSyncAccess,
    change: (next: string | null) => {
      subject = next;
    },
  };
}
function database() {
  const getFirstAsync = jest.fn().mockResolvedValue(null);
  const runAsync = jest.fn();
  return {
    db: { getFirstAsync, runAsync } as unknown as SqliteWorkoutPort,
    getFirstAsync,
    runAsync,
  };
}
const detail = {
  session_id: SESSION,
  lifecycle_state: 'completed',
  started_at: '2026-10-09T14:00:00+00:00',
  finished_at: '2026-10-09T15:00:00+00:00',
  completion_snapshot_id: SNAPSHOT,
  finish_mutation_id: '0d72c629-6248-4221-8ab2-d9b9f1b63901',
  completion_snapshot: {
    session_id: SESSION,
    completion_snapshot_id: SNAPSHOT,
    unplanned_performed_occurrences: [
      {
        occurrence_id: OCCURRENCE,
        canonical_exercise_id: EXERCISE,
        actual_order: 0,
        set_ids: [SET],
      },
    ],
  },
  occurrences: [
    {
      occurrence_id: OCCURRENCE,
      canonical_exercise_id: EXERCISE,
      actual_order: 0,
      first_set_id: SET,
      sets: [
        {
          set_id: SET,
          mutation_id: 'c4b03454-a640-4b84-a525-6bf05f068b9e',
          occurrence_id: OCCURRENCE,
          set_role: 'WORKING',
          measurement_type: 'reps',
          reps: 8,
          duration_seconds: null,
          distance_decimal: null,
          distance_unit: null,
          load_decimal: '27.500',
          load_unit: 'lb',
          load_entry_semantics: 'machine_display',
          machine_profile_id: null,
          machine_configuration_id: null,
          completed_at: '2026-10-09T14:30:00+00:00',
        },
      ],
    },
  ],
};
function response(value: unknown): Response {
  return {
    status: 200,
    json: async () => value,
  } as Response;
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(auditCompletedWorkoutHistory).mockResolvedValue({
    status: 'complete',
    compared: 0,
    pendingLocal: [],
    remoteOnly: [SESSION],
    acknowledgedLocalOnly: [],
    diverged: [],
  });
  jest.mocked(requestApi).mockResolvedValue(response(detail));
});

it('previews only authenticated owner-scoped, complete native workouts without writes', async () => {
  const { db, runAsync, getFirstAsync } = database();
  expect(
    await previewRemoteOnlyWorkout(db, credentials().access, SESSION),
  ).toEqual({
    status: 'candidate',
    preview: {
      sessionId: SESSION,
      finishedAt: '2026-10-09T15:00:00+00:00',
      occurrenceCount: 1,
      confirmedSets: 1,
      workingSets: 1,
    },
  });
  expect(getFirstAsync).toHaveBeenCalledTimes(4);
  expect(runAsync).not.toHaveBeenCalled();
  expect(requestApi).toHaveBeenCalledWith(
    '/workout-sessions/' + SESSION + '/history-detail',
    expect.objectContaining({
      method: 'GET',
      headers: { Authorization: 'Bearer in-memory-auth-only' },
    }),
  );
});

it('blocks local active/completed/cancelled collision before fetching remote detail', async () => {
  const { db, getFirstAsync, runAsync } = database();
  getFirstAsync.mockResolvedValueOnce({ session_id: SESSION });
  expect(
    await previewRemoteOnlyWorkout(db, credentials().access, SESSION),
  ).toEqual({
    status: 'paused',
    reason: 'localCollision',
  });
  expect(requestApi).not.toHaveBeenCalled();
  expect(runAsync).not.toHaveBeenCalled();
});

it('checks collisions again after remote HTTP response to avoid a race', async () => {
  const { db, getFirstAsync, runAsync } = database();
  getFirstAsync
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ session_id: SESSION })
    .mockResolvedValueOnce(null);
  expect(
    await previewRemoteOnlyWorkout(db, credentials().access, SESSION),
  ).toEqual({
    status: 'paused',
    reason: 'localCollision',
  });
  expect(runAsync).not.toHaveBeenCalled();
});

it('does not claim remote absence without a complete authoritative audit', async () => {
  const { db } = database();
  jest.mocked(auditCompletedWorkoutHistory).mockResolvedValueOnce({
    status: 'incomplete',
    reason: 'limit',
    compared: 0,
    pendingLocal: [],
    remoteOnly: [],
    acknowledgedLocalOnly: [],
    diverged: [],
  });
  expect(
    await previewRemoteOnlyWorkout(db, credentials().access, SESSION),
  ).toEqual({
    status: 'paused',
    reason: 'incompleteAudit',
  });
  expect(requestApi).not.toHaveBeenCalled();
});

it('rejects incomplete history detail and missing real native-set measurements', async () => {
  const { db, runAsync } = database();
  jest.mocked(requestApi).mockResolvedValueOnce(
    response({
      ...detail,
      occurrences: [{ ...detail.occurrences[0], sets: [] }],
    }),
  );
  expect(
    await previewRemoteOnlyWorkout(db, credentials().access, SESSION),
  ).toEqual({
    status: 'paused',
    reason: 'invalidResponse',
  });
  jest.mocked(requestApi).mockResolvedValueOnce(
    response({
      ...detail,
      occurrences: [
        {
          ...detail.occurrences[0],
          sets: [{ ...detail.occurrences[0].sets[0], load_unit: 'kg' }],
        },
      ],
      completion_snapshot: {
        ...detail.completion_snapshot,
        unplanned_performed_occurrences: [],
      },
    }),
  );
  expect(
    await previewRemoteOnlyWorkout(db, credentials().access, SESSION),
  ).toEqual({
    status: 'paused',
    reason: 'invalidResponse',
  });
  expect(runAsync).not.toHaveBeenCalled();
});

it('preserves local state on offline failure, foreign auth and mid-request logout', async () => {
  const { db, runAsync } = database();
  jest.mocked(requestApi).mockRejectedValueOnce(new Error('offline'));
  expect(
    await previewRemoteOnlyWorkout(db, credentials().access, SESSION),
  ).toEqual({
    status: 'paused',
    reason: 'network',
  });
  const auth = credentials();
  jest.mocked(requestApi).mockImplementationOnce(async () => {
    auth.change(OTHER);
    return response(detail);
  });
  await expect(
    previewRemoteOnlyWorkout(db, auth.access, SESSION),
  ).rejects.toThrow('notAuthenticated');
  expect(runAsync).not.toHaveBeenCalled();
});
