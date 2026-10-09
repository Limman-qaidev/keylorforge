import {
  listLocalFinishedWorkouts,
  LOCAL_FINISHED_HISTORY_SQL,
  type FinishedWorkoutHistoryEntry,
} from '../local-finish-history';
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
  observed: { sql: string; params: unknown[] } | null = null;
  duringRead?: () => void;
  writes = 0;

  async getFirstAsync<T>(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<T | null> {
    this.observed = { sql, params };
    this.duringRead?.();
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
      (await listLocalFinishedWorkouts(db, identity().access))[0].sync_state,
    ).toBe('pending');
    db.items = [{ ...completed, sync_state: 'acknowledged' }];
    expect(
      (await listLocalFinishedWorkouts(db, identity().access))[0].sync_state,
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
    await expect(listLocalFinishedWorkouts(db, auth.access)).rejects.toMatchObject({
      code: 'corruptLocalData',
    });
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
