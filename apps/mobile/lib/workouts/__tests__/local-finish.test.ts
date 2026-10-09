import {
  finishLocalFreeWorkout,
  readLocalFinishedWorkout,
  type LocalFinishInput,
  type LocalFinishRow,
} from '../local-finish';
import type { SqliteQueryPort, SqliteWorkoutPort } from '../local-schema';
import type { LocalSubjectAccess, LocalWorkoutSession } from '../local-store';

const SUBJECT = 'b35c00d6-243c-4dea-a095-000000000132';
const OTHER = 'b35c00d6-243c-4dea-a095-000000000133';
const SESSION = '1f2d27bc-4904-4f4f-9367-39565d78f211';
const MUTATION = '0d72c629-6248-4221-8ab2-d9b9f1b63901';
const SNAPSHOT = '17e1a62d-965f-4caf-a509-c95ab2fe6438';
const OCCURRENCE = 'c226a777-d460-4d5f-bad6-f75667a9d022';
const EXERCISE = '502c4c87-80a5-4567-9aaf-296e43bfc4d1';
const SET_ID = '1b428bd6-781d-44ec-8609-57af594a5511';
const SET_MUTATION = 'fa3f8b27-e2a0-47bf-9850-531a51e8f955';
const START_MUTATION = 'df493bd5-0a51-487a-bacb-ae1b3c7ec126';
const DATE = '2026-10-09T15:00:00.000Z';

const input: LocalFinishInput = {
  sessionId: SESSION,
  mutationId: MUTATION,
  completionSnapshotId: SNAPSHOT,
  finishedAtUtc: DATE,
};

type Outbox = {
  subject: string;
  session_id: string;
  mutation_id: string;
  mutation_kind: string;
  payload_json: string;
  depends_on_mutation_id: string | null;
  delivery_state: 'pending' | 'acknowledged';
};
type LocalSet = {
  subject: string;
  session_id: string;
  set_id: string;
  set_role: 'WARMUP' | 'WORKING';
};

function sessionRow(subject = SUBJECT): LocalWorkoutSession {
  return {
    subject,
    session_id: SESSION,
    lifecycle_state: 'active',
    origin: 'free',
    started_at_utc: '2026-10-09T14:00:00.000Z',
    time_zone: 'Europe/Madrid',
    utc_offset_minutes: 120,
    local_date: '2026-10-09',
    original_agenda_json: JSON.stringify({
      schema_version: 1,
      origin: 'free',
      items: [],
    }),
    agenda_revision: 0,
  };
}

class FakeFinishDb implements SqliteWorkoutPort {
  sessions = new Map<string, LocalWorkoutSession>();
  outbox = new Map<string, Outbox>();
  snapshots = new Map<string, LocalFinishRow>();
  sets: LocalSet[] = [];
  hasParent = true;
  failSnapshotWrite = false;
  onWrite?: () => void;

  constructor(role: 'WARMUP' | 'WORKING' | null = 'WORKING') {
    this.sessions.set(SUBJECT, sessionRow());
    this.outbox.set(START_MUTATION, {
      subject: SUBJECT,
      session_id: SESSION,
      mutation_id: START_MUTATION,
      mutation_kind: 'START_SESSION',
      payload_json: '{}',
      depends_on_mutation_id: null,
      delivery_state: 'pending',
    });
    if (role) {
      this.sets.push({
        subject: SUBJECT,
        session_id: SESSION,
        set_id: SET_ID,
        set_role: role,
      });
      this.outbox.set(SET_MUTATION, {
        subject: SUBJECT,
        session_id: SESSION,
        mutation_id: SET_MUTATION,
        mutation_kind: 'CONFIRM_FIRST_SET_WITH_OCCURRENCE',
        payload_json: '{}',
        depends_on_mutation_id: START_MUTATION,
        delivery_state: 'pending',
      });
    }
  }

  async execAsync(): Promise<void> {}

  async getFirstAsync<T>(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<T | null> {
    const subject = String(params[0]);
    const sessionId = String(params[1]);
    let result: unknown = null;
    if (
      sql.includes('FROM local_workout_outbox') &&
      sql.includes('ORDER BY rowid DESC')
    ) {
      const values = [...this.outbox.values()].filter(
        (row) => row.subject === subject && row.session_id === sessionId,
      );
      result = this.hasParent ? values[values.length - 1] : null;
    } else if (sql.includes('FROM local_workout_outbox')) {
      const row = this.outbox.get(sessionId);
      result = row?.subject === subject ? row : null;
    } else if (sql.includes('FROM local_workout_sessions')) {
      const row = this.sessions.get(subject);
      result = row?.session_id === sessionId ? row : null;
    } else if (sql.includes('FROM local_workout_final_snapshots')) {
      const row = this.snapshots.get(subject);
      result = row?.session_id === sessionId ? row : null;
    } else if (sql.includes('COUNT(*) AS count')) {
      result = {
        count: this.sets.filter(
          (row) =>
            row.subject === subject &&
            row.session_id === sessionId &&
            (!sql.includes("set_role = 'WORKING'") ||
              row.set_role === 'WORKING'),
        ).length,
      };
    } else if (sql.includes('AS items_json')) {
      const items = this.sets
        .filter(
          (row) => row.subject === subject && row.session_id === sessionId,
        )
        .map((row) => row.set_id);
      result = {
        items_json: JSON.stringify(
          items.length
            ? [
                {
                  occurrence_id: OCCURRENCE,
                  canonical_exercise_id: EXERCISE,
                  actual_order: 0,
                  agenda_item_id: null,
                  set_ids: items,
                },
              ]
            : [],
        ),
      };
    } else {
      throw new Error('Unexpected SELECT: ' + sql);
    }
    return (result ?? null) as T | null;
  }

  async runAsync(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<unknown> {
    if (sql.includes('INSERT INTO local_workout_outbox')) {
      const [subject, mutation, sessionId, payload, created, parent] = params;
      this.outbox.set(String(mutation), {
        subject: String(subject),
        mutation_id: String(mutation),
        session_id: String(sessionId),
        payload_json: String(payload),
        mutation_kind: 'FINISH_SESSION',
        depends_on_mutation_id: String(parent),
        delivery_state: 'pending',
      });
      void created;
    } else if (sql.includes('INSERT INTO local_workout_final_snapshots')) {
      if (this.failSnapshotWrite) throw new Error('SQLite disk unavailable');
      const [subject, session, mutation, snapshot, at, json] = params;
      this.snapshots.set(String(subject), {
        subject: String(subject),
        session_id: String(session),
        finish_mutation_id: String(mutation),
        completion_snapshot_id: String(snapshot),
        finished_at_utc: String(at),
        final_agenda_json: String(json),
      });
    } else if (sql.includes('UPDATE local_workout_sessions')) {
      const [subject] = params;
      const row = this.sessions.get(String(subject));
      if (row) {
        this.sessions.set(String(subject), {
          ...row,
          lifecycle_state: 'completed',
        });
      }
    } else {
      throw new Error('Unexpected write: ' + sql);
    }
    this.onWrite?.();
    return undefined;
  }

  async withExclusiveTransactionAsync(
    task: (tx: SqliteQueryPort) => Promise<void>,
  ): Promise<void> {
    const prior = {
      sessions: new Map(this.sessions),
      outbox: new Map(this.outbox),
      snapshots: new Map(this.snapshots),
    };
    try {
      await task(this);
    } catch (error) {
      this.sessions = prior.sessions;
      this.outbox = prior.outbox;
      this.snapshots = prior.snapshots;
      throw error;
    }
  }
}

function identity() {
  let subject: string | null = SUBJECT;
  const access: LocalSubjectAccess = {
    currentAuthenticatedSubject: () => subject,
  };
  return {
    access,
    setSubject(value: string | null) {
      subject = value;
    },
  };
}

describe('M3 offline-first atomic Free Workout Finish', () => {
  it('commits session, final snapshot and causal outbox', async () => {
    const db = new FakeFinishDb();
    const auth = identity();
    const finish = await finishLocalFreeWorkout(db, auth.access, input);
    expect(db.sessions.get(SUBJECT)?.lifecycle_state).toBe('completed');
    expect(db.outbox.get(MUTATION)).toMatchObject({
      mutation_kind: 'FINISH_SESSION',
      depends_on_mutation_id: SET_MUTATION,
      delivery_state: 'pending',
    });
    const snapshot = JSON.parse(finish.final_agenda_json);
    expect(snapshot).toMatchObject({
      completion_snapshot_id: SNAPSHOT,
      final_agenda_revision: 0,
      agenda_items: [],
      applied_agenda_change_ids: [],
      unplanned_performed_occurrences: [
        { occurrence_id: OCCURRENCE, set_ids: [SET_ID] },
      ],
    });
    expect(
      JSON.parse(db.outbox.get(MUTATION)!.payload_json).completion_snapshot,
    ).toEqual(snapshot);
    expect(await readLocalFinishedWorkout(db, auth.access, SESSION)).toEqual(
      finish,
    );
    expect(await finishLocalFreeWorkout(db, auth.access, input)).toEqual(
      finish,
    );
    expect(db.outbox.size).toBe(3);
    expect(db.sets).toHaveLength(1);
  });

  it('rejects empty and WARMUP-only work atomically', async () => {
    for (const role of [null, 'WARMUP'] as const) {
      const db = new FakeFinishDb(role);
      await expect(
        finishLocalFreeWorkout(db, identity().access, input),
      ).rejects.toMatchObject({ code: 'noQualifyingWork' });
      expect(db.sessions.get(SUBJECT)?.lifecycle_state).toBe('active');
      expect(db.snapshots.size).toBe(0);
      expect(db.outbox.has(MUTATION)).toBe(false);
    }
  });

  it('rejects invalid input, agendas and session state', async () => {
    const db = new FakeFinishDb();
    const auth = identity();
    await expect(
      finishLocalFreeWorkout(db, auth.access, {
        ...input,
        mutationId: 'invalid',
      }),
    ).rejects.toMatchObject({ code: 'invalidInput' });
    await expect(
      finishLocalFreeWorkout(db, auth.access, {
        ...input,
        finishedAtUtc: '2026-10-09T13:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'invalidInput' });
    db.sessions.set(SUBJECT, { ...sessionRow(), agenda_revision: 1 });
    await expect(
      finishLocalFreeWorkout(db, auth.access, input),
    ).rejects.toMatchObject({ code: 'unsupportedAgenda' });
    db.sessions.set(SUBJECT, {
      ...sessionRow(),
      lifecycle_state: 'cancelled',
    });
    await expect(
      finishLocalFreeWorkout(db, auth.access, input),
    ).rejects.toMatchObject({ code: 'sessionNotActive' });
  });

  it('rejects conflicting mutation and second Finish', async () => {
    const db = new FakeFinishDb();
    const auth = identity();
    await finishLocalFreeWorkout(db, auth.access, input);
    await expect(
      finishLocalFreeWorkout(db, auth.access, {
        ...input,
        completionSnapshotId: 'd2cf1351-27eb-402d-8665-069820d02fab',
      }),
    ).rejects.toMatchObject({ code: 'mutationConflict' });
    await expect(
      finishLocalFreeWorkout(db, auth.access, {
        ...input,
        mutationId: '8ed19459-bcc1-48ee-9861-456b49ddef08',
      }),
    ).rejects.toMatchObject({ code: 'sessionNotActive' });
    expect(db.snapshots.size).toBe(1);
  });

  it('rolls back on SQLite error and identity switch', async () => {
    const first = new FakeFinishDb();
    first.failSnapshotWrite = true;
    await expect(
      finishLocalFreeWorkout(first, identity().access, input),
    ).rejects.toThrow('SQLite disk unavailable');
    expect(first.outbox.has(MUTATION)).toBe(false);
    expect(first.sessions.get(SUBJECT)?.lifecycle_state).toBe('active');

    const second = new FakeFinishDb();
    const auth = identity();
    second.onWrite = () => auth.setSubject(null);
    await expect(
      finishLocalFreeWorkout(second, auth.access, input),
    ).rejects.toMatchObject({ code: 'notAuthenticated' });
    expect(second.snapshots.size).toBe(0);
    expect(second.outbox.has(MUTATION)).toBe(false);
    expect(second.sessions.get(SUBJECT)?.lifecycle_state).toBe('active');
  });

  it('isolates finished history between accounts', async () => {
    const db = new FakeFinishDb();
    await finishLocalFreeWorkout(db, identity().access, input);
    const other = identity();
    other.setSubject(OTHER);
    expect(
      await readLocalFinishedWorkout(db, other.access, SESSION),
    ).toBeNull();
    await expect(
      finishLocalFreeWorkout(db, other.access, input),
    ).rejects.toMatchObject({ code: 'sessionNotActive' });
    expect(db.snapshots.size).toBe(1);
  });

  it('rejects missing parent without enqueuing', async () => {
    const db = new FakeFinishDb();
    db.hasParent = false;
    await expect(
      finishLocalFreeWorkout(db, identity().access, input),
    ).rejects.toMatchObject({ code: 'missingDependency' });
    expect(db.outbox.has(MUTATION)).toBe(false);
    expect(db.sessions.get(SUBJECT)?.lifecycle_state).toBe('active');
  });
});
