import {
  listUnifiedFinishedWorkouts,
  UNIFIED_FINISHED_HISTORY_SQL,
} from '../unified-finish-history';
import type { SqliteWorkoutPort } from '../local-schema';
import type { LocalSubjectAccess } from '../local-store';

const OWNER = 'a3dbf764-e0e3-41aa-9895-6e58eadfbb14';
const OTHER = 'e426dd13-344a-4b69-8920-cb014715c6c1';
const LOCAL_ID = '1f2d27bc-4904-4f4f-9367-39565d78f211';
const REMOTE_ID = '6fbcfd94-2b37-4a29-9f57-ff58753a0011';
const SNAPSHOT = '17e1a62d-965f-4caf-a509-c95ab2fe6438';

const local = {
  subject: OWNER,
  origin: 'local',
  session_id: LOCAL_ID,
  completion_snapshot_id: SNAPSHOT,
  finished_at_utc: '2026-10-08T15:00:00Z',
  total_sets: 2,
  working_sets: 1,
  sync_state: 'pending',
};
const remote = {
  subject: OWNER,
  origin: 'remote_complete',
  session_id: REMOTE_ID,
  completion_snapshot_id: SNAPSHOT,
  finished_at_utc: '2026-10-09T15:00:00+00:00',
  total_sets: 3,
  working_sets: 2,
  sync_state: null,
};

function fixture(rows: unknown[] = [remote, local]) {
  let subject: string | null = OWNER;
  const getFirstAsync = jest.fn().mockResolvedValue({
    items_json: JSON.stringify(rows),
  });
  const runAsync = jest.fn();
  const access: LocalSubjectAccess = {
    currentAuthenticatedSubject: () => subject,
  };
  const db = { getFirstAsync, runAsync } as unknown as SqliteWorkoutPort;
  return {
    db,
    access,
    getFirstAsync,
    runAsync,
    switchTo: (next: string | null) => {
      subject = next;
    },
  };
}

it('reads ordered local + remote entries without promoting pending FINISH to ACK', async () => {
  const f = fixture();
  expect(await listUnifiedFinishedWorkouts(f.db, f.access)).toEqual([
    remote,
    local,
  ]);
  expect(f.getFirstAsync).toHaveBeenCalledWith(
    UNIFIED_FINISHED_HISTORY_SQL,
    OWNER,
    OWNER,
    20,
    0,
  );
  expect(f.runAsync).not.toHaveBeenCalled();
});

it('suppresses local/outbox collisions and cancelled workouts by SQL contract', () => {
  expect(UNIFIED_FINISHED_HISTORY_SQL).toContain('UNION ALL');
  expect(UNIFIED_FINISHED_HISTORY_SQL).toContain(
    "w.lifecycle_state = 'completed'",
  );
  expect(UNIFIED_FINISHED_HISTORY_SQL).toContain(
    "o.mutation_kind = 'FINISH_SESSION'",
  );
  expect(UNIFIED_FINISHED_HISTORY_SQL.match(/NOT EXISTS/g)).toHaveLength(2);
  expect(UNIFIED_FINISHED_HISTORY_SQL).toContain(
    'lower(l.session_id) = lower(r.session_id)',
  );
  expect(UNIFIED_FINISHED_HISTORY_SQL).toContain(
    'lower(o.session_id) = lower(r.session_id)',
  );
});

it('keeps remote-origin entries free of fabricated local ACKs', async () => {
  const f = fixture([{ ...remote, sync_state: 'acknowledged' }]);
  await expect(listUnifiedFinishedWorkouts(f.db, f.access)).rejects.toThrow(
    'corruptLocalData',
  );
  expect(f.runAsync).not.toHaveBeenCalled();
});

it('rejects account mixing and logout after the SQLite query', async () => {
  const foreign = fixture([{ ...remote, subject: OTHER }]);
  await expect(
    listUnifiedFinishedWorkouts(foreign.db, foreign.access),
  ).rejects.toThrow('corruptLocalData');
  const switched = fixture();
  switched.getFirstAsync.mockImplementation(async () => {
    switched.switchTo(OTHER);
    return { items_json: JSON.stringify([remote]) };
  });
  await expect(
    listUnifiedFinishedWorkouts(switched.db, switched.access),
  ).rejects.toThrow('notAuthenticated');
  switched.switchTo(null);
  await expect(
    listUnifiedFinishedWorkouts(switched.db, switched.access),
  ).rejects.toThrow('notAuthenticated');
});

it('rejects malformed rows and enforces bounded pagination', async () => {
  const f = fixture([{ ...local, total_sets: 0 }]);
  await expect(listUnifiedFinishedWorkouts(f.db, f.access)).rejects.toThrow(
    'corruptLocalData',
  );
  await expect(
    listUnifiedFinishedWorkouts(f.db, f.access, { limit: 51 }),
  ).rejects.toThrow('invalidInput');
  await expect(
    listUnifiedFinishedWorkouts(f.db, f.access, { offset: -1 }),
  ).rejects.toThrow('invalidInput');
  expect(f.getFirstAsync).toHaveBeenCalledTimes(1);
});

it('uses the same SQLite query with explicit owner and pagination parameters', async () => {
  const f = fixture([]);
  expect(
    await listUnifiedFinishedWorkouts(f.db, f.access, {
      limit: 10,
      offset: 20,
    }),
  ).toEqual([]);
  expect(f.getFirstAsync).toHaveBeenCalledWith(
    UNIFIED_FINISHED_HISTORY_SQL,
    OWNER,
    OWNER,
    10,
    20,
  );
});
