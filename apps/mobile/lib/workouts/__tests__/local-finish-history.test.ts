import {
  listLocalFinishedWorkouts,
  readLocalFinishedWorkoutDetail,
  LOCAL_FINISHED_HISTORY_SQL,
  LOCAL_FINISHED_DETAIL_GUARD_SQL,
  type FinishedWorkoutHistoryEntry,
} from '../local-finish-history';
import { ACTIVE_WORKOUT_OVERVIEW_SQL } from '../active-workout-overview';
import type { SqliteQueryPort, SqliteWorkoutPort } from '../local-schema';
import type { LocalSubjectAccess } from '../local-store';

const OWNER = 'a3dbf764-e0e3-41aa-9895-6e58eadfbb14';
const OTHER = 'e426dd13-344a-4b69-8920-cb014715c6c1';
const SESSION = '1f2d27bc-4904-4f4f-9367-39565d78f211';
const SNAPSHOT = '17e1a62d-965f-4caf-a509-c95ab2fe6438';

const completed: FinishedWorkoutHistoryEntry = {
  session_id: SESSION,
  completion_snapshot_id: SNAPSHOT,
  started_at_utc: '2026-10-09T14:00:00.000Z',
  finished_at_utc: '2026-10-09T15:00:00.000Z',
  local_date: '2026-10-09',
  total_sets: 2,
  working_sets: 1,
  sync_state: 'pending',
};

class ReadOnlyDb implements SqliteWorkoutPort {
  items: unknown = [completed];
  detailGuard: unknown = {
    completion_snapshot_id: SNAPSHOT,
    started_at_utc: completed.started_at_utc,
    finished_at_utc: completed.finished_at_utc,
    local_date: completed.local_date,
    sync_state: 'pending',
  };
  ledger: unknown = [
    {
      occurrence_id: 'c226a777-d460-4d5f-bad6-f75667a9d022',
      canonical_exercise_id: '502c4c87-80a5-4567-9aaf-296e43bfc4d1',
      actual_order: 0,
      agenda_item_id: null,
      sets: [
        {
          set_id: '1b428bd6-781d-44ec-8609-57af594a5511',
          set_role: 'WORKING',
          measurement_type: 'reps',
          reps: 8,
          duration_seconds: null,
          distance_decimal: null,
          distance_unit: null,
          load_decimal: '25',
          load_unit: 'kg',
          completed_at_utc: '2026-10-09T14:30:00.000Z',
        },
        {
          set_id: '0d72c629-6248-4221-8ab2-d9b9f1b63901',
          set_role: 'WARMUP',
          measurement_type: 'reps',
          reps: 12,
          duration_seconds: null,
          distance_decimal: null,
          distance_unit: null,
          load_decimal: '0',
          load_unit: 'kg',
          completed_at_utc: '2026-10-09T14:15:00.000Z',
        },
      ],
    },
  ];
  queries: { sql: string; params: unknown[] }[] = [];
  observed: { sql: string; params: unknown[] } | null = null;
  duringRead?: () => void;
  writes = 0;

  async getFirstAsync<T>(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<T | null> {
    this.observed = { sql, params };
    this.queries.push({ sql, params });
    this.duringRead?.();
    if (sql === LOCAL_FINISHED_DETAIL_GUARD_SQL) {
      return this.detailGuard as T | null;
    }
    if (sql === ACTIVE_WORKOUT_OVERVIEW_SQL) {
      return { items_json: JSON.stringify(this.ledger) } as T;
    }
    return { items_json: JSON.stringify(this.items) } as T;
  }

  async runAsync(): Promise<unknown> {
    this.writes++;
    throw new Error('Unexpected write');
  }

  async execAsync(): Promise<void> {
    this.writes++;
    throw new Error('Unexpected schema change');
  }

  async withExclusiveTransactionAsync(
    _task: (tx: SqliteQueryPort) => Promise<void>,
  ): Promise<void> {
    this.writes++;
    throw new Error('Unexpected write transaction');
  }
}

function identity() {
  let subject: string | null = OWNER;
  const access: LocalSubjectAccess = {
    currentAuthenticatedSubject: () => subject,
  };
  return {
    access,
    switchTo(value: string | null) {
      subject = value;
    },
  };
}

describe('read-only SQLite finished workout history', () => {
  it('returns a bounded owner-scoped history page with explicit sync status', async () => {
    const db = new ReadOnlyDb();
    const page = await listLocalFinishedWorkouts(db, identity().access, {
      limit: 10,
      offset: 2,
    });
    expect(page).toEqual([completed]);
    expect(db.observed).toEqual({
      sql: LOCAL_FINISHED_HISTORY_SQL,
      params: [OWNER, 10, 2],
    });
    expect(LOCAL_FINISHED_HISTORY_SQL).toContain(
      "w.lifecycle_state = 'completed'",
    );
    expect(LOCAL_FINISHED_HISTORY_SQL).toContain(
      "o.mutation_kind = 'FINISH_SESSION'",
    );
    expect(LOCAL_FINISHED_HISTORY_SQL).toContain(
      'ORDER BY f.finished_at_utc DESC, f.session_id DESC',
    );
    expect(db.writes).toBe(0);
  });

  it('treats a locally completed but unacknowledged Finish as pending, not synchronized', async () => {
    const db = new ReadOnlyDb();
    expect(
      (await listLocalFinishedWorkouts(db, identity().access))[0]?.sync_state,
    ).toBe('pending');
    db.items = [{ ...completed, sync_state: 'acknowledged' }];
    expect(
      (await listLocalFinishedWorkouts(db, identity().access))[0]?.sync_state,
    ).toBe('acknowledged');
    db.items = [];
    expect(await listLocalFinishedWorkouts(db, identity().access)).toEqual([]);
  });

  it('rejects account switch during the SQLite read without returning private data', async () => {
    const db = new ReadOnlyDb();
    const auth = identity();
    db.duringRead = () => auth.switchTo(OTHER);
    await expect(
      listLocalFinishedWorkouts(db, auth.access),
    ).rejects.toMatchObject({ code: 'notAuthenticated' });
    expect(db.writes).toBe(0);
  });

  it('reads exact completed sets with owner-scoped ledger, no mutation or synthetic values', async () => {
    const db = new ReadOnlyDb();
    const result = await readLocalFinishedWorkoutDetail(
      db,
      identity().access,
      completed,
    );
    expect(result.entry).toEqual(completed);
    expect(
      result.exercises[0]?.sets.map((set) => [
        set.set_role,
        set.reps,
        set.load_decimal,
      ]),
    ).toEqual([
      ['WORKING', 8, '25'],
      ['WARMUP', 12, '0'],
    ]);
    expect(db.queries).toEqual([
      { sql: LOCAL_FINISHED_DETAIL_GUARD_SQL, params: [OWNER, SESSION] },
      { sql: ACTIVE_WORKOUT_OVERVIEW_SQL, params: [OWNER, SESSION] },
    ]);
    expect(LOCAL_FINISHED_DETAIL_GUARD_SQL).toContain(
      "w.lifecycle_state = 'completed'",
    );
    expect(db.writes).toBe(0);
  });

  it('rejects missing/completed-state mismatch, corrupted ledger, and cross-account reads', async () => {
    const db = new ReadOnlyDb();
    db.detailGuard = null;
    await expect(
      readLocalFinishedWorkoutDetail(db, identity().access, completed),
    ).rejects.toMatchObject({ code: 'corruptLocalData' });
    db.detailGuard = {
      completion_snapshot_id: SNAPSHOT,
      started_at_utc: completed.started_at_utc,
      finished_at_utc: completed.finished_at_utc,
      local_date: completed.local_date,
      sync_state: 'pending',
    };
    db.ledger = [];
    await expect(
      readLocalFinishedWorkoutDetail(db, identity().access, completed),
    ).rejects.toMatchObject({ code: 'corruptLocalData' });
    db.ledger = 'invalid-ledger';
    await expect(
      readLocalFinishedWorkoutDetail(db, identity().access, completed),
    ).rejects.toMatchObject({ code: 'corruptLocalData' });
    db.duringRead = () => {
      auth.switchTo(OTHER);
    };
    const auth = identity();
    await expect(
      readLocalFinishedWorkoutDetail(db, auth.access, completed),
    ).rejects.toMatchObject({ code: 'notAuthenticated' });
    expect(db.writes).toBe(0);
  });

  it('rejects malformed pages and corrupted or fabricated history', async () => {
    const db = new ReadOnlyDb();
    const auth = identity();
    for (const bad of [
      { limit: 0 },
      { limit: 51 },
      { offset: -1 },
      { offset: 0.5 },
    ]) {
      await expect(
        listLocalFinishedWorkouts(db, auth.access, bad),
      ).rejects.toMatchObject({ code: 'invalidInput' });
    }
    db.items = [{ ...completed, working_sets: 0 }];
    await expect(
      listLocalFinishedWorkouts(db, auth.access),
    ).rejects.toMatchObject({ code: 'corruptLocalData' });
    db.items = [{ ...completed, total_sets: -2 }];
    await expect(
      listLocalFinishedWorkouts(db, auth.access),
    ).rejects.toMatchObject({ code: 'corruptLocalData' });
    db.items = [completed, completed];
    await expect(
      listLocalFinishedWorkouts(db, auth.access, { limit: 1 }),
    ).rejects.toMatchObject({ code: 'corruptLocalData' });
    auth.switchTo(null);
    await expect(
      listLocalFinishedWorkouts(db, auth.access),
    ).rejects.toMatchObject({ code: 'notAuthenticated' });
  });
});
