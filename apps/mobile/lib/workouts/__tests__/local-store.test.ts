import {
  getActiveLocalWorkout,
  getPendingLocalWorkoutMutations,
  LocalWorkoutError,
  startLocalFreeWorkout,
  type LocalOutboxItem,
  type LocalStartWorkoutInput,
  type LocalSubjectAccess,
  type LocalWorkoutSession,
} from '../local-store';
import {
  initializeLocalWorkoutSchema,
  type SqliteWorkoutPort,
  type SqliteQueryPort,
} from '../local-schema';

const subjectA = 'a3dbf764-e0e3-41aa-9895-6e58eadfbb14';
const subjectB = 'e426dd13-344a-4b69-8920-cb014715c6c1';

const input: LocalStartWorkoutInput = {
  sessionId: '1f2d27bc-4904-4f4f-9367-39565d78f211',
  mutationId: 'bf6ba981-334f-4d88-b081-c74d65b940fa',
  startedAtUtc: '2026-10-08T14:30:00.000Z',
  timeZone: 'Europe/Madrid',
  utcOffsetMinutes: 120,
  localDate: '2026-10-08',
};

class FakeTransactionalSQLite implements SqliteWorkoutPort {
  readonly sessions = new Map<string, LocalWorkoutSession>();
  readonly outbox = new Map<string, LocalOutboxItem>();
  schema = '';
  failOutboxInsert = false;
  onSessionInsert: (() => void) | undefined;

  async execAsync(sql: string): Promise<void> {
    this.schema = sql;
  }

  async withExclusiveTransactionAsync(
    task: (tx: SqliteQueryPort) => Promise<void>,
  ): Promise<void> {
    const savedSessions = new Map(this.sessions);
    const savedOutbox = new Map(this.outbox);
    try {
      await task(this);
    } catch (error) {
      this.sessions.clear();
      this.outbox.clear();
      savedSessions.forEach((v, k) => this.sessions.set(k, v));
      savedOutbox.forEach((v, k) => this.outbox.set(k, v));
      throw error;
    }
  }

  async getFirstAsync<T>(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<T | null> {
    const subject = String(params[0]);
    if (sql.includes('FROM local_workout_outbox')) {
      const found = sql.includes('mutation_id = ?')
        ? this.outbox.get(subject + ':' + String(params[1]))
        : [...this.outbox.values()].find(
            (item) =>
              item.subject === subject && item.delivery_state === 'pending',
          );
      return (found ?? null) as T | null;
    }
    const found = sql.includes('WHERE session_id = ?')
      ? [...this.sessions.values()].find((row) => row.session_id === subject)
      : sql.includes('session_id = ?')
        ? this.sessions.get(subject + ':' + String(params[1]))
        : [...this.sessions.values()].find(
            (row) =>
              row.subject === subject && row.lifecycle_state === 'active',
          );
    return (found ?? null) as T | null;
  }

  async runAsync(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<unknown> {
    if (sql.includes('INSERT INTO local_workout_sessions')) {
      const [subject, sessionId, started, zone, offset, day, agenda] = params;
      const row: LocalWorkoutSession = {
        subject: String(subject),
        session_id: String(sessionId),
        lifecycle_state: 'active',
        origin: 'free',
        started_at_utc: String(started),
        time_zone: String(zone),
        utc_offset_minutes: Number(offset),
        local_date: String(day),
        original_agenda_json: String(agenda),
        agenda_revision: 0,
      };
      this.sessions.set(row.subject + ':' + row.session_id, row);
      this.onSessionInsert?.();
      return;
    }
    if (sql.includes('INSERT INTO local_workout_outbox')) {
      if (this.failOutboxInsert) {
        throw new Error('disk full');
      }
      const [subject, mutationId, sessionId, payload, created] = params;
      const row: LocalOutboxItem = {
        subject: String(subject),
        mutation_id: String(mutationId),
        session_id: String(sessionId),
        mutation_kind: 'START_SESSION',
        protocol_version: 1,
        payload_json: String(payload),
        delivery_state: 'pending',
        created_at_utc: String(created),
      };
      this.outbox.set(row.subject + ':' + row.mutation_id, row);
      return;
    }
    throw new Error('Unexpected SQL');
  }
}

function accountAccess(initial: string | null = subjectA): {
  access: LocalSubjectAccess;
  setSubject: (next: string | null) => void;
} {
  let subject = initial;
  return {
    access: { currentAuthenticatedSubject: () => subject },
    setSubject: (next) => {
      subject = next;
    },
  };
}

describe('M3 account-partitioned local workout transaction', () => {
  it('keeps a local start and pending versioned outbox through retry/relaunch', async () => {
    const db = new FakeTransactionalSQLite();
    const auth = accountAccess();
    await initializeLocalWorkoutSchema(db);
    expect(db.schema).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS local_one_active',
    );
    const result = await startLocalFreeWorkout(db, auth.access, input);
    expect(result.session_id).toBe(input.sessionId);
    expect(db.sessions.size).toBe(1);
    expect(db.outbox.size).toBe(1);
    expect(JSON.parse(result.original_agenda_json).items).toEqual([]);
    const replay = await startLocalFreeWorkout(db, auth.access, input);
    expect(replay).toEqual(result);
    expect(db.sessions.size).toBe(1);
    expect(db.outbox.size).toBe(1);
    expect(await getActiveLocalWorkout(db, auth.access)).toEqual(result);
    const [pending] = await getPendingLocalWorkoutMutations(db, auth.access);
    expect(JSON.parse(pending!.payload_json)).toEqual({
      protocol_version: 1,
      session_id: input.sessionId,
      mutation_id: input.mutationId,
      started_at: input.startedAtUtc,
      time_zone: input.timeZone,
    });
  });

  it('rejects second sessions and mutation ID reuse without losing history', async () => {
    const db = new FakeTransactionalSQLite();
    const auth = accountAccess();
    await startLocalFreeWorkout(db, auth.access, input);
    await expect(
      startLocalFreeWorkout(db, auth.access, { ...input, timeZone: 'UTC' }),
    ).rejects.toMatchObject({ code: 'mutationConflict' });
    await expect(
      startLocalFreeWorkout(db, auth.access, {
        ...input,
        mutationId: '40548e0d-fd72-400f-9254-687eea1d4017',
        sessionId: '989833df-86cf-4d52-b91d-7b5bb3e7d1b0',
      }),
    ).rejects.toMatchObject({ code: 'activeSessionExists' });
    expect(db.outbox.size).toBe(1);
  });

  it('keeps user A data invisible when switching to user B or signing out', async () => {
    const db = new FakeTransactionalSQLite();
    const auth = accountAccess();
    await startLocalFreeWorkout(db, auth.access, input);
    auth.setSubject(subjectB);
    expect(await getActiveLocalWorkout(db, auth.access)).toBeNull();
    expect(await getPendingLocalWorkoutMutations(db, auth.access)).toEqual([]);
    auth.setSubject(null);
    await expect(getActiveLocalWorkout(db, auth.access)).rejects.toMatchObject({
      code: 'notAuthenticated',
    });
    auth.setSubject(subjectA);
    expect((await getActiveLocalWorkout(db, auth.access))?.session_id).toBe(
      input.sessionId,
    );
  });

  it('rolls back BOTH rows if inserting the outbox fails', async () => {
    const db = new FakeTransactionalSQLite();
    db.failOutboxInsert = true;
    await expect(
      startLocalFreeWorkout(db, accountAccess().access, input),
    ).rejects.toThrow('disk full');
    expect(db.sessions.size).toBe(0);
    expect(db.outbox.size).toBe(0);
  });

  it('rolls back an in-flight start when authentication changes', async () => {
    const db = new FakeTransactionalSQLite();
    const auth = accountAccess();
    db.onSessionInsert = () => auth.setSubject(subjectB);
    await expect(
      startLocalFreeWorkout(db, auth.access, input),
    ).rejects.toBeInstanceOf(LocalWorkoutError);
    expect(db.sessions.size).toBe(0);
    expect(db.outbox.size).toBe(0);
  });
});
