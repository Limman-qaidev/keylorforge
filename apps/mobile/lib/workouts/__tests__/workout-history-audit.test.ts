import { requestApi } from '../../api/client';
import { auditCompletedWorkoutHistory } from '../workout-history-audit';
import type { SqliteWorkoutPort } from '../local-schema';
import type { StartSyncAccess } from '../start-session-sync';

jest.mock('../../api/client', () => ({ requestApi: jest.fn() }));

const OWNER = 'a3dbf764-e0e3-41aa-9895-6e58eadfbb14';
const OTHER = 'e426dd13-344a-4b69-8920-cb014715c6c1';
const SESSION = '1f2d27bc-4904-4f4f-9367-39565d78f211';
const SNAPSHOT = '17e1a62d-965f-4caf-a509-c95ab2fe6438';
const FINISH = '0d72c629-6248-4221-8ab2-d9b9f1b63901';

const snapshot = {
  schema_version: 1,
  completion_snapshot_id: SNAPSHOT,
  session_id: SESSION,
  original_agenda: { schema_version: 1, origin: 'free', items: [] },
  unplanned_performed_occurrences: [],
};
const local = {
  session_id: SESSION,
  completion_snapshot_id: SNAPSHOT,
  started_at_utc: '2026-10-09T14:00:00.000Z',
  finished_at_utc: '2026-10-09T15:00:00.000Z',
  local_date: '2026-10-09',
  total_sets: 1,
  working_sets: 1,
  sync_state: 'acknowledged',
};
const remote = {
  session_id: SESSION,
  completion_snapshot_id: SNAPSHOT,
  finish_mutation_id: FINISH,
  started_at: '2026-10-09T14:00:00+00:00',
  finished_at: '2026-10-09T15:00:00+00:00',
  local_date: '2026-10-09',
  total_sets: 1,
  working_sets: 1,
  completion_snapshot: snapshot,
};

function auth() {
  let current: string | null = OWNER;
  const access: StartSyncAccess = {
    currentAuthenticatedSubject: () => current,
    acquireCurrentCredentials: async () => ({
      subject: OWNER,
      accessToken: 'test-token',
    }),
  };
  return {
    access,
    switchTo(next: string | null) {
      current = next;
    },
  };
}

function dbWith(items: unknown[], final = JSON.stringify(snapshot)) {
  const getFirstAsync = jest.fn(async (sql: string) =>
    sql.includes('FROM local_workout_final_snapshots')
      ? {
          subject: OWNER,
          session_id: SESSION,
          completion_snapshot_id: SNAPSHOT,
          finish_mutation_id: FINISH,
          final_agenda_json: final,
        }
      : { items_json: JSON.stringify(items) },
  );
  const runAsync = jest.fn();
  return {
    db: { getFirstAsync, runAsync } as unknown as SqliteWorkoutPort,
    runAsync,
  };
}

function http(entries: unknown[]): Response {
  return {
    status: 200,
    json: async () => ({
      entries,
      next_before_finished_at: null,
      next_before_session_id: null,
    }),
  } as Response;
}

beforeEach(() => jest.resetAllMocks());

it('compares acknowledged immutable history without local writes', async () => {
  jest.mocked(requestApi).mockResolvedValue(http([remote]));
  const { db, runAsync } = dbWith([local]);
  expect(await auditCompletedWorkoutHistory(db, auth().access)).toEqual({
    status: 'complete',
    compared: 1,
    pendingLocal: [],
    remoteOnly: [],
    acknowledgedLocalOnly: [],
    diverged: [],
  });
  expect(runAsync).not.toHaveBeenCalled();
});

it('preserves pending local workouts when server has no completion', async () => {
  jest.mocked(requestApi).mockResolvedValue(http([]));
  const { db, runAsync } = dbWith([{ ...local, sync_state: 'pending' }]);
  expect(await auditCompletedWorkoutHistory(db, auth().access)).toMatchObject({
    pendingLocal: [SESSION],
    acknowledgedLocalOnly: [],
    diverged: [],
  });
  expect(runAsync).not.toHaveBeenCalled();
});

it('reports snapshot disagreement without repairing it automatically', async () => {
  jest.mocked(requestApi).mockResolvedValue(http([remote]));
  const { db, runAsync } = dbWith([local], JSON.stringify({ ...snapshot, changed: true }));
  expect(await auditCompletedWorkoutHistory(db, auth().access)).toMatchObject({
    status: 'complete',
    diverged: [SESSION],
    compared: 0,
  });
  expect(runAsync).not.toHaveBeenCalled();
});

it('rejects account changes while reading server history', async () => {
  const account = auth();
  jest.mocked(requestApi).mockImplementation(async () => {
    account.switchTo(OTHER);
    return http([remote]);
  });
  await expect(
    auditCompletedWorkoutHistory(dbWith([local]).db, account.access),
  ).rejects.toThrow('notAuthenticated');
});

it('does not infer remote absence from malformed pages', async () => {
  jest.mocked(requestApi).mockResolvedValue({
    status: 200,
    json: async () => ({ entries: [], next_before_session_id: SESSION }),
  } as Response);
  expect(await auditCompletedWorkoutHistory(dbWith([local]).db, auth().access))
    .toMatchObject({
      status: 'paused',
      reason: 'invalidResponse',
      acknowledgedLocalOnly: [],
    });
});
