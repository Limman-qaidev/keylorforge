import {
  diagnoseCachedRemoteHistory,
  REMOTE_CACHE_IDS_SQL,
} from '../remote-history-drift';
import { auditCompletedWorkoutHistory } from '../workout-history-audit';
import { readCachedRemoteOnlyWorkout } from '../remote-history-cache';
import {
  fetchRemoteOnlyWorkoutCandidate,
  isVerifiedRemoteHistoryCandidate,
} from '../remote-history-preview';
import type { SqliteWorkoutPort } from '../local-schema';
import type { StartSyncAccess } from '../start-session-sync';

jest.mock('../workout-history-audit', () => ({
  auditCompletedWorkoutHistory: jest.fn(),
}));
jest.mock('../remote-history-cache', () => ({
  readCachedRemoteOnlyWorkout: jest.fn(),
}));
jest.mock('../remote-history-preview', () => ({
  fetchRemoteOnlyWorkoutCandidate: jest.fn(),
  isVerifiedRemoteHistoryCandidate: jest.fn(),
}));

const OWNER = 'a3dbf764-e0e3-41aa-9895-6e58eadfbb14';
const OTHER = 'e426dd13-344a-4b69-8920-cb014715c6c1';
const ONE = '1f2d27bc-4904-4f4f-9367-39565d78f211';
const TWO = '6fbcfd94-2b37-4a29-9f57-ff58753a0011';
const THREE = 'a46d8ad9-386d-4a6e-9ad2-9cbd721abf92';
const SNAPSHOT = '17e1a62d-965f-4caf-a509-c95ab2fe6438';
const FINISH = '0d72c629-6248-4221-8ab2-d9b9f1b63901';
const preview = {
  sessionId: ONE,
  finishedAt: '2026-10-09T15:00:00Z',
  occurrenceCount: 1,
  confirmedSets: 1,
  workingSets: 1,
};
const detail = {
  session_id: ONE,
  completion_snapshot_id: SNAPSHOT,
  finish_mutation_id: FINISH,
  occurrences: [{ id: 'native', reps: 9, load: { unit: 'lb' } }],
};

function who() {
  let current: string | null = OWNER;
  return {
    access: {
      currentAuthenticatedSubject: () => current,
      acquireCurrentCredentials: async () => null,
    } satisfies StartSyncAccess,
    switchTo: (next: string | null) => {
      current = next;
    },
  };
}

const getFirstAsync = jest.fn();
const runAsync = jest.fn();
const db = { getFirstAsync, runAsync } as unknown as SqliteWorkoutPort;

function audit(ids: string[] = [ONE]) {
  return {
    status: 'complete' as const,
    compared: 0,
    pendingLocal: [],
    remoteOnly: ids,
    acknowledgedLocalOnly: [],
    diverged: [],
  };
}

function cached(id: string = ONE) {
  return {
    preview: { ...preview, sessionId: id },
    detailJson: JSON.stringify({ ...detail, session_id: id }),
  };
}

function server(id: string = ONE) {
  return {
    status: 'candidate' as const,
    preview: { ...preview, sessionId: id },
    detailJson: JSON.stringify({ ...detail, session_id: id }),
    completionSnapshotId: SNAPSHOT,
    finishMutationId: FINISH,
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(auditCompletedWorkoutHistory).mockResolvedValue(audit());
  jest
    .mocked(readCachedRemoteOnlyWorkout)
    .mockImplementation(async (_, __, id) => cached(id));
  jest
    .mocked(fetchRemoteOnlyWorkoutCandidate)
    .mockImplementation(async (_, __, id) => server(id));
  jest.mocked(isVerifiedRemoteHistoryCandidate).mockReturnValue(true);
  getFirstAsync.mockImplementation(async (sql: string) =>
    sql === REMOTE_CACHE_IDS_SQL
      ? { items_json: JSON.stringify([{ session_id: ONE }]) }
      : null,
  );
});

it('confirms matching owner-scoped detail without SQLite writes or fake ACK', async () => {
  const result = await diagnoseCachedRemoteHistory(db, who().access);
  expect(result).toEqual({
    state: 'idle',
    findings: [{ sessionId: ONE, status: 'matching' }],
    nextAfterSessionId: ONE,
  });
  expect(getFirstAsync).toHaveBeenCalledWith(
    REMOTE_CACHE_IDS_SQL,
    OWNER,
    '',
    4,
  );
  expect(runAsync).not.toHaveBeenCalled();
});

it('ignores object-key ordering but detects changed native set data', async () => {
  jest.mocked(fetchRemoteOnlyWorkoutCandidate).mockResolvedValueOnce({
    ...server(),
    detailJson: JSON.stringify({
      occurrences: detail.occurrences,
      finish_mutation_id: FINISH,
      completion_snapshot_id: SNAPSHOT,
      session_id: ONE,
    }),
  });
  expect(
    (await diagnoseCachedRemoteHistory(db, who().access)).findings[0]?.status,
  ).toBe('matching');
  jest.mocked(fetchRemoteOnlyWorkoutCandidate).mockResolvedValueOnce({
    ...server(),
    detailJson: JSON.stringify({
      ...detail,
      occurrences: [{ ...detail.occurrences[0], reps: 10 }],
    }),
  });
  expect(await diagnoseCachedRemoteHistory(db, who().access)).toEqual({
    state: 'paused',
    findings: [{ sessionId: ONE, status: 'remoteChanged' }],
    nextAfterSessionId: ONE,
    reason: 'unresolvedDrift',
  });
  expect(runAsync).not.toHaveBeenCalled();
});

it('does not call a missing completed session cancelled or delete cached data', async () => {
  jest.mocked(auditCompletedWorkoutHistory).mockResolvedValueOnce(audit([]));
  expect(await diagnoseCachedRemoteHistory(db, who().access)).toEqual({
    state: 'paused',
    findings: [{ sessionId: ONE, status: 'notListedAsCompleted' }],
    nextAfterSessionId: ONE,
    reason: 'unresolvedDrift',
  });
  expect(fetchRemoteOnlyWorkoutCandidate).not.toHaveBeenCalled();
});

it('isolates local collisions without asking server or rewriting outbox', async () => {
  getFirstAsync.mockImplementation(async (sql: string) =>
    sql === REMOTE_CACHE_IDS_SQL
      ? { items_json: JSON.stringify([{ session_id: ONE }]) }
      : { session_id: ONE },
  );
  expect(
    (await diagnoseCachedRemoteHistory(db, who().access)).findings[0]?.status,
  ).toBe('localCollision');
  expect(fetchRemoteOnlyWorkoutCandidate).not.toHaveBeenCalled();
  expect(runAsync).not.toHaveBeenCalled();
});

it('refuses incomplete server audit before any detail GET or local page', async () => {
  jest.mocked(auditCompletedWorkoutHistory).mockResolvedValueOnce({
    ...audit(),
    status: 'incomplete',
    reason: 'limit',
  });
  expect(await diagnoseCachedRemoteHistory(db, who().access)).toEqual({
    state: 'paused',
    findings: [],
    nextAfterSessionId: null,
    reason: 'limit',
  });
  expect(getFirstAsync).not.toHaveBeenCalled();
  expect(fetchRemoteOnlyWorkoutCandidate).not.toHaveBeenCalled();
});

it('fails closed on corrupt local payload, invalid page, and remote auth', async () => {
  jest.mocked(isVerifiedRemoteHistoryCandidate).mockReturnValueOnce(false);
  expect(await diagnoseCachedRemoteHistory(db, who().access)).toMatchObject({
    state: 'paused',
    reason: 'corruptCache',
  });
  getFirstAsync.mockResolvedValueOnce({
    items_json: JSON.stringify([{ session_id: TWO }, { session_id: ONE }]),
  });
  expect(await diagnoseCachedRemoteHistory(db, who().access)).toMatchObject({
    state: 'paused',
    reason: 'corruptCacheIndex',
  });
  jest.mocked(fetchRemoteOnlyWorkoutCandidate).mockResolvedValueOnce({
    status: 'paused',
    reason: 'auth',
  });
  expect(await diagnoseCachedRemoteHistory(db, who().access)).toMatchObject({
    state: 'paused',
    reason: 'auth',
  });
});

it('rechecks subject after awaits and does not leak another account', async () => {
  const auth = who();
  getFirstAsync.mockImplementationOnce(async () => {
    auth.switchTo(OTHER);
    return { items_json: '[]' };
  });
  await expect(diagnoseCachedRemoteHistory(db, auth.access)).rejects.toThrow(
    'notAuthenticated',
  );
  const next = who();
  jest
    .mocked(fetchRemoteOnlyWorkoutCandidate)
    .mockImplementationOnce(async () => {
      next.switchTo(null);
      return server();
    });
  await expect(diagnoseCachedRemoteHistory(db, next.access)).rejects.toThrow(
    'notAuthenticated',
  );
});

it('supports bounded, restartable keyset paging without writes', async () => {
  jest
    .mocked(auditCompletedWorkoutHistory)
    .mockResolvedValue(audit([ONE, TWO, THREE]));
  getFirstAsync.mockImplementation(
    async (sql: string, _: string, after: string) =>
      sql !== REMOTE_CACHE_IDS_SQL
        ? null
        : {
            items_json: JSON.stringify(
              (after === '' ? [ONE, TWO] : [TWO]).map((sessionId) => ({
                session_id: sessionId,
              })),
            ),
          },
  );
  const first = await diagnoseCachedRemoteHistory(db, who().access, {
    batchSize: 1,
  });
  expect(first.state).toBe('yielded');
  expect(first.nextAfterSessionId).toBe(ONE);
  const second = await diagnoseCachedRemoteHistory(db, who().access, {
    batchSize: 1,
    afterSessionId: ONE,
  });
  expect(second.state).toBe('idle');
  expect(second.nextAfterSessionId).toBe(TWO);
  expect(runAsync).not.toHaveBeenCalled();
});

it('enforces limits and single-flight per SQLite connection', async () => {
  for (const batchSize of [0, 6, 1.5]) {
    await expect(
      diagnoseCachedRemoteHistory(db, who().access, { batchSize }),
    ).rejects.toThrow('invalidDriftBatch');
  }
  let finish!: (value: ReturnType<typeof audit>) => void;
  jest.mocked(auditCompletedWorkoutHistory).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const first = diagnoseCachedRemoteHistory(db, who().access);
  expect(await diagnoseCachedRemoteHistory(db, who().access)).toEqual({
    state: 'busy',
    findings: [],
    nextAfterSessionId: null,
  });
  finish(audit([]));
  await first;
});
