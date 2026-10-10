import {
  recoverRemoteHistoryBatch,
} from '../remote-history-recovery-batch';
import {
  cacheRemoteOnlyWorkout,
  readCachedRemoteOnlyWorkout,
} from '../remote-history-cache';
import { auditCompletedWorkoutHistory } from '../workout-history-audit';
import type { SqliteWorkoutPort } from '../local-schema';
import type { StartSyncAccess } from '../start-session-sync';

jest.mock('../workout-history-audit', () => ({
  auditCompletedWorkoutHistory: jest.fn(),
}));
jest.mock('../remote-history-cache', () => ({
  cacheRemoteOnlyWorkout: jest.fn(),
  readCachedRemoteOnlyWorkout: jest.fn(),
}));

const OWNER = 'a3dbf764-e0e3-41aa-9895-6e58eadfbb14';
const OTHER = 'e426dd13-344a-4b69-8920-cb014715c6c1';
const ONE = '1f2d27bc-4904-4f4f-9367-39565d78f211';
const TWO = '6fbcfd94-2b37-4a29-9f57-ff58753a0011';
const THREE = 'a46d8ad9-386d-4a6e-9ad2-9cbd721abf92';
const db = {} as SqliteWorkoutPort;

function auth() {
  let owner: string | null = OWNER;
  return {
    access: {
      currentAuthenticatedSubject: () => owner,
      acquireCurrentCredentials: async () => null,
    } satisfies StartSyncAccess,
    switchTo: (next: string | null) => {
      owner = next;
    },
  };
}

function audit(ids: string[] = [ONE, TWO, THREE]) {
  return {
    status: 'complete' as const,
    compared: 0,
    pendingLocal: [],
    remoteOnly: ids,
    acknowledgedLocalOnly: [],
    diverged: [],
  };
}

function stored(sessionId: string) {
  return {
    status: 'stored' as const,
    preview: {
      sessionId,
      finishedAt: '2026-10-09T15:00:00Z',
      occurrenceCount: 1,
      confirmedSets: 1,
      workingSets: 1,
    },
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(auditCompletedWorkoutHistory).mockResolvedValue(audit());
  jest.mocked(readCachedRemoteOnlyWorkout).mockResolvedValue(null);
  jest.mocked(cacheRemoteOnlyWorkout).mockImplementation(
    async (_, __, id) => stored(id),
  );
});

it('recovers a small batch in audit order without directly mutating SQLite', async () => {
  const result = await recoverRemoteHistoryBatch(db, auth().access, 2);
  expect(result).toEqual({
    state: 'yielded',
    stored: 2,
    alreadyCached: 0,
    skippedConflicts: 0,
    attempted: 2,
  });
  expect(jest.mocked(cacheRemoteOnlyWorkout).mock.calls.map(x => x[2]))
    .toEqual([ONE, TWO]);
});

it('resumes from existing immutable cache without duplicating writes', async () => {
  const cached = new Set<string>();
  jest.mocked(readCachedRemoteOnlyWorkout).mockImplementation(
    async (_, __, id) =>
      cached.has(id)
        ? { preview: stored(id).preview, detailJson: '{}' }
        : null,
  );
  jest.mocked(cacheRemoteOnlyWorkout).mockImplementation(async (_, __, id) => {
    cached.add(id);
    return stored(id);
  });
  expect(await recoverRemoteHistoryBatch(db, auth().access, 2)).toMatchObject({
    state: 'yielded',
    stored: 2,
    attempted: 2,
  });
  expect(await recoverRemoteHistoryBatch(db, auth().access, 2)).toEqual({
    state: 'idle',
    stored: 1,
    alreadyCached: 2,
    skippedConflicts: 0,
    attempted: 1,
  });
  expect(jest.mocked(cacheRemoteOnlyWorkout).mock.calls.map(x => x[2]))
    .toEqual([ONE, TWO, THREE]);
});

it('fails closed before any write on an incomplete authoritative audit', async () => {
  jest.mocked(auditCompletedWorkoutHistory).mockResolvedValue({
    ...audit(),
    status: 'incomplete',
    reason: 'limit',
    remoteOnly: [],
  });
  expect(await recoverRemoteHistoryBatch(db, auth().access)).toEqual({
    state: 'paused',
    stored: 0,
    alreadyCached: 0,
    skippedConflicts: 0,
    attempted: 0,
    reason: 'limit',
  });
  expect(cacheRemoteOnlyWorkout).not.toHaveBeenCalled();
  expect(readCachedRemoteOnlyWorkout).not.toHaveBeenCalled();
});

it('stops on network failure while preserving prior committed cache records', async () => {
  jest.mocked(cacheRemoteOnlyWorkout)
    .mockResolvedValueOnce(stored(ONE))
    .mockResolvedValueOnce({ status: 'paused', reason: 'network' });
  const result = await recoverRemoteHistoryBatch(db, auth().access);
  expect(result).toEqual({
    state: 'paused',
    stored: 1,
    alreadyCached: 0,
    skippedConflicts: 0,
    attempted: 2,
    reason: 'network',
  });
  expect(cacheRemoteOnlyWorkout).toHaveBeenCalledTimes(2);
});

it('isolates a local collision without stopping independent recoveries', async () => {
  jest.mocked(cacheRemoteOnlyWorkout)
    .mockResolvedValueOnce({ status: 'paused', reason: 'localCollision' })
    .mockResolvedValueOnce(stored(TWO));
  jest.mocked(auditCompletedWorkoutHistory).mockResolvedValue(audit([ONE, TWO]));
  expect(await recoverRemoteHistoryBatch(db, auth().access)).toEqual({
    state: 'idle',
    stored: 1,
    alreadyCached: 0,
    skippedConflicts: 1,
    attempted: 2,
  });
});

it('blocks owner switch between cached read and remote write', async () => {
  const who = auth();
  jest.mocked(readCachedRemoteOnlyWorkout).mockImplementation(async () => {
    who.switchTo(OTHER);
    return null;
  });
  await expect(recoverRemoteHistoryBatch(db, who.access)).rejects.toThrow(
    'notAuthenticated',
  );
  expect(cacheRemoteOnlyWorkout).not.toHaveBeenCalled();
});

it('blocks owner switch after a remote write and always releases its lock', async () => {
  const who = auth();
  jest.mocked(cacheRemoteOnlyWorkout).mockImplementationOnce(async () => {
    who.switchTo(null);
    return stored(ONE);
  });
  await expect(recoverRemoteHistoryBatch(db, who.access)).rejects.toThrow(
    'notAuthenticated',
  );
  expect(await recoverRemoteHistoryBatch(db, auth().access, 1)).toMatchObject({
    state: 'yielded',
    stored: 1,
  });
});

it('prevents concurrent recovery passes against the same database', async () => {
  let complete!: (value: ReturnType<typeof audit>) => void;
  jest.mocked(auditCompletedWorkoutHistory).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const first = recoverRemoteHistoryBatch(db, auth().access, 1);
  expect(await recoverRemoteHistoryBatch(db, auth().access)).toEqual({
    state: 'busy',
    stored: 0,
    alreadyCached: 0,
    skippedConflicts: 0,
    attempted: 0,
  });
  complete(audit([]));
  expect(await first).toMatchObject({ state: 'idle', attempted: 0 });
});

it('rejects invalid bounds and duplicated or corrupt audit candidate IDs', async () => {
  for (const value of [0, 6, 1.5, Number.NaN]) {
    await expect(
      recoverRemoteHistoryBatch(db, auth().access, value),
    ).rejects.toThrow('invalidRecoveryBatch');
  }
  jest.mocked(auditCompletedWorkoutHistory).mockResolvedValueOnce(
    audit([ONE, ONE.toUpperCase()]),
  );
  expect(await recoverRemoteHistoryBatch(db, auth().access)).toMatchObject({
    state: 'paused',
    reason: 'invalidResponse',
    attempted: 0,
  });
  expect(cacheRemoteOnlyWorkout).not.toHaveBeenCalled();
});
