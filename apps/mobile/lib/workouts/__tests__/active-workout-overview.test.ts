import {
  ACTIVE_WORKOUT_OVERVIEW_SQL,
  readActiveFreeWorkoutOverview,
  type ActiveExerciseSummary,
} from '../active-workout-overview';
import type { SqliteQueryPort, SqliteWorkoutPort } from '../local-schema';
import type { LocalSubjectAccess, LocalWorkoutSession } from '../local-store';

const OWNER = 'a3dbf764-e0e3-41aa-9895-6e58eadfbb14';
const OTHER = 'e426dd13-344a-4b69-8920-cb014715c6c1';
const SESSION = '1f2d27bc-4904-4f4f-9367-39565d78f211';
const OCCURRENCE = 'c226a777-d460-4d5f-bad6-f75667a9d022';
const EXERCISE = '502c4c87-80a5-4567-9aaf-296e43bfc4d1';
const SET_ID = '1b428bd6-781d-44ec-8609-57af594a5511';

const session: LocalWorkoutSession = {
  subject: OWNER,
  session_id: SESSION,
  lifecycle_state: 'active',
  origin: 'free',
  started_at_utc: '2026-10-09T14:00:00.000Z',
  time_zone: 'Europe/Madrid',
  utc_offset_minutes: 120,
  local_date: '2026-10-09',
  original_agenda_json: '{"schema_version":1,"origin":"free","items":[]}',
  agenda_revision: 0,
};
const exercise: ActiveExerciseSummary = {
  occurrence_id: OCCURRENCE,
  canonical_exercise_id: EXERCISE,
  actual_order: 0,
  agenda_item_id: null,
  sets: [
    {
      set_id: SET_ID,
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
  ],
};

class Reader implements SqliteWorkoutPort {
  active: LocalWorkoutSession | null = session;
  rows: unknown = [exercise];
  calls: string[] = [];
  duringOverview?: () => void;
  writes = 0;
  async execAsync(): Promise<void> {
    this.writes++;
    throw new Error('Unexpected write');
  }
  async runAsync(): Promise<unknown> {
    this.writes++;
    throw new Error('Unexpected write');
  }
  async withExclusiveTransactionAsync(
    _task: (tx: SqliteQueryPort) => Promise<void>,
  ): Promise<void> {
    this.writes++;
    throw new Error('Unexpected transaction');
  }
  async getFirstAsync<T>(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<T | null> {
    this.calls.push(sql);
    if (sql.includes('FROM local_workout_sessions')) {
      return (this.active?.subject === params[0]
        ? this.active
        : null) as T | null;
    }
    if (sql === ACTIVE_WORKOUT_OVERVIEW_SQL) {
      this.duringOverview?.();
      expect(params).toEqual([OWNER, SESSION]);
      return { items_json: JSON.stringify(this.rows) } as T;
    }
    throw new Error('Unknown SQL ' + sql);
  }
}

function auth() {
  let subject: string | null = OWNER;
  return {
    access: {
      currentAuthenticatedSubject: () => subject,
    } satisfies LocalSubjectAccess,
    change(next: string | null) {
      subject = next;
    },
  };
}

describe('resumable active Free Workout from SQLite', () => {
  it('returns the exact confirmed sets, including load units and role', async () => {
    const db = new Reader();
    const result = await readActiveFreeWorkoutOverview(db, auth().access);
    expect(result).toEqual({
      session,
      exercises: [exercise],
      totalSets: 1,
      workingSets: 1,
    });
    expect(db.writes).toBe(0);
    expect(db.calls).toHaveLength(2);
    expect(ACTIVE_WORKOUT_OVERVIEW_SQL).toContain(
      'ORDER BY s.completed_at_utc, s.set_id',
    );
  });

  it('distinguishes no active workout from an active workout with no sets', async () => {
    const db = new Reader();
    db.active = null;
    expect(await readActiveFreeWorkoutOverview(db, auth().access)).toBeNull();
    expect(db.calls).toHaveLength(1);
    db.active = session;
    db.rows = [];
    expect(await readActiveFreeWorkoutOverview(db, auth().access)).toEqual({
      session,
      exercises: [],
      totalSets: 0,
      workingSets: 0,
    });
  });

  it('does not reveal a different account or after a signout during read', async () => {
    const db = new Reader();
    const other = auth();
    other.change(OTHER);
    expect(await readActiveFreeWorkoutOverview(db, other.access)).toBeNull();
    const original = auth();
    db.duringOverview = () => original.change(null);
    await expect(
      readActiveFreeWorkoutOverview(db, original.access),
    ).rejects.toMatchObject({ code: 'notAuthenticated' });
    expect(db.writes).toBe(0);
  });

  it('rejects duplicated and imaginary performed history', async () => {
    const db = new Reader();
    db.rows = [{ ...exercise, sets: [] }];
    await expect(
      readActiveFreeWorkoutOverview(db, auth().access),
    ).rejects.toMatchObject({ code: 'corruptLocalData' });
    db.rows = [{ ...exercise, sets: [exercise.sets[0], exercise.sets[0]] }];
    await expect(
      readActiveFreeWorkoutOverview(db, auth().access),
    ).rejects.toMatchObject({ code: 'corruptLocalData' });
    db.rows = [{ ...exercise, agenda_item_id: 'fabricated-id' }];
    await expect(
      readActiveFreeWorkoutOverview(db, auth().access),
    ).rejects.toMatchObject({ code: 'corruptLocalData' });
  });
});
