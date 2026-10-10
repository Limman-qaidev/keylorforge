import { cancelLocalFreeWorkout, type LocalCancelRow } from '../local-cancel';
import type { SqliteQueryPort, SqliteWorkoutPort } from '../local-schema';
import type { LocalSubjectAccess, LocalWorkoutSession } from '../local-store';

const OWNER = 'a3dbf764-e0e3-41aa-9895-6e58eadfbb14';
const OTHER = 'e426dd13-344a-4b69-8920-cb014715c6c1';
const SESSION = '1f2d27bc-4904-4f4f-9367-39565d78f211';
const START = '1b428bd6-781d-44ec-8609-57af594a5511';
const SET_MUTATION = 'c226a777-d460-4d5f-bad6-f75667a9d022';
const CANCEL = '0d72c629-6248-4221-8ab2-d9b9f1b63901';
const CANCEL_AT = '2026-10-09T15:00:00.000Z';

type Mutation = {
  subject: string;
  session_id: string;
  mutation_id: string;
  mutation_kind: string;
  payload_json: string;
  depends_on_mutation_id: string | null;
};

class FakeCancelDb implements SqliteWorkoutPort {
  sessions = new Map<string, LocalWorkoutSession>();
  mutations: Mutation[] = [];
  cancellations = new Map<string, LocalCancelRow>();
  setCount = 0;
  failAuditWrite = false;
  onRead?: () => void;
  writes = 0;

  constructor() {
    this.sessions.set(OWNER, {
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
    });
    this.mutations.push({
      subject: OWNER,
      session_id: SESSION,
      mutation_id: START,
      mutation_kind: 'START_SESSION',
      payload_json: '{}',
      depends_on_mutation_id: null,
    });
  }

  async execAsync(): Promise<void> {
    throw new Error('No DDL permitted');
  }

  async withExclusiveTransactionAsync(
    task: (tx: SqliteQueryPort) => Promise<void>,
  ): Promise<void> {
    const sessions = new Map([...this.sessions].map(([k, v]) => [k, { ...v }]));
    const mutations = this.mutations.map((row) => ({ ...row }));
    const cancellations = new Map(
      [...this.cancellations].map(([k, v]) => [k, { ...v }]),
    );
    const writes = this.writes;
    try {
      await task(this);
    } catch (error) {
      this.sessions = sessions;
      this.mutations = mutations;
      this.cancellations = cancellations;
      this.writes = writes;
      throw error;
    }
  }

  async getFirstAsync<T>(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<T | null> {
    const subject = String(params[0]);
    const id = String(params[1]);
    this.onRead?.();
    let row: unknown = null;
    if (sql.includes('FROM local_workout_outbox')) {
      const relevant = this.mutations.filter(
        (entry) => entry.subject === subject && entry.session_id === id,
      );
      if (
        sql.includes("mutation_kind IN ('FINISH_SESSION', 'CANCEL_SESSION')")
      ) {
        row = {
          count: relevant.filter((entry) =>
            ['FINISH_SESSION', 'CANCEL_SESSION'].includes(entry.mutation_kind),
          ).length,
        };
      } else if (sql.includes('ORDER BY rowid DESC')) {
        row = relevant[relevant.length - 1] ?? null;
      } else {
        row =
          this.mutations.find(
            (entry) => entry.subject === subject && entry.mutation_id === id,
          ) ?? null;
      }
    } else if (sql.includes('FROM local_workout_sessions')) {
      const session = this.sessions.get(subject);
      row = session?.session_id === id ? session : null;
    } else if (sql.includes('FROM local_workout_cancellations')) {
      const cancellation = this.cancellations.get(subject);
      row = cancellation?.session_id === id ? cancellation : null;
    } else if (sql.includes('COUNT(*)') && sql.includes('local_workout_sets')) {
      row = { count: this.setCount };
    } else if (sql.includes('MAX(completed_at_utc)')) {
      row = {
        completed_at_utc: this.setCount ? '2026-10-09T14:30:00.000Z' : null,
      };
    } else {
      throw new Error('Unrecognised query ' + sql);
    }
    return (row ?? null) as T | null;
  }

  async runAsync(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<void> {
    this.writes++;
    const subject = String(params[0]);
    if (sql.includes('INSERT INTO local_workout_outbox')) {
      const [sub, mutation, session, payload, , parent] = params;
      this.mutations.push({
        subject: String(sub),
        mutation_id: String(mutation),
        session_id: String(session),
        mutation_kind: 'CANCEL_SESSION',
        payload_json: String(payload),
        depends_on_mutation_id: String(parent),
      });
    } else if (sql.includes('INSERT INTO local_workout_cancellations')) {
      if (this.failAuditWrite) throw new Error('Disk full');
      const [sub, session, mutation, at, count] = params;
      this.cancellations.set(String(sub), {
        subject: String(sub),
        session_id: String(session),
        cancel_mutation_id: String(mutation),
        cancelled_at_utc: String(at),
        prior_confirmed_sets: Number(count),
      });
    } else if (sql.includes('UPDATE local_workout_sessions')) {
      const session = this.sessions.get(subject);
      if (session) {
        this.sessions.set(subject, {
          ...session,
          lifecycle_state: 'cancelled',
        });
      }
    } else {
      throw new Error('Unexpected write ' + sql);
    }
  }
}

function auth() {
  let subject: string | null = OWNER;
  return {
    access: {
      currentAuthenticatedSubject: () => subject,
    } satisfies LocalSubjectAccess,
    switchTo: (next: string | null) => {
      subject = next;
    },
  };
}

function input(confirmDiscardPerformedSets = false) {
  return {
    sessionId: SESSION,
    mutationId: CANCEL,
    cancelledAtUtc: CANCEL_AT,
    confirmDiscardPerformedSets,
  };
}

describe('offline-first explicit CANCEL_SESSION', () => {
  it('atomically cancels a zero-set session without deleting its START intent', async () => {
    const db = new FakeCancelDb();
    const row = await cancelLocalFreeWorkout(db, auth().access, input());
    expect(row).toMatchObject({ prior_confirmed_sets: 0 });
    expect(db.sessions.get(OWNER)?.lifecycle_state).toBe('cancelled');
    expect(db.mutations.map((m) => m.mutation_kind)).toEqual([
      'START_SESSION',
      'CANCEL_SESSION',
    ]);
    expect(db.mutations[1]?.depends_on_mutation_id).toBe(START);
    expect(db.mutations[1]?.payload_json).toContain(
      '"discard_performed_sets_confirmed":false',
    );
    expect(await cancelLocalFreeWorkout(db, auth().access, input())).toEqual(
      row,
    );
    expect(db.mutations).toHaveLength(2);
  });

  it('requires destructive confirmation when any set exists, preserving the set outbox', async () => {
    const db = new FakeCancelDb();
    db.setCount = 1;
    db.mutations.push({
      subject: OWNER,
      session_id: SESSION,
      mutation_id: SET_MUTATION,
      mutation_kind: 'CONFIRM_FIRST_SET_WITH_OCCURRENCE',
      payload_json: '{"recorded":true}',
      depends_on_mutation_id: START,
    });
    await expect(
      cancelLocalFreeWorkout(db, auth().access, input()),
    ).rejects.toMatchObject({ code: 'requiresDiscardConfirmation' });
    expect(db.mutations).toHaveLength(2);
    const row = await cancelLocalFreeWorkout(db, auth().access, input(true));
    expect(row.prior_confirmed_sets).toBe(1);
    expect(db.mutations[2]?.depends_on_mutation_id).toBe(SET_MUTATION);
    expect(db.mutations[1]?.payload_json).toBe('{"recorded":true}');
    expect(db.setCount).toBe(1);
  });

  it('rejects a foreign account, reused conflicting mutation, and post-FINISH cancel', async () => {
    const db = new FakeCancelDb();
    const owner = auth();
    owner.switchTo(OTHER);
    await expect(
      cancelLocalFreeWorkout(db, owner.access, input()),
    ).rejects.toMatchObject({ code: 'sessionNotActive' });
    db.mutations[0]!.mutation_id = CANCEL;
    await expect(
      cancelLocalFreeWorkout(db, auth().access, input()),
    ).rejects.toMatchObject({ code: 'mutationConflict' });
    db.mutations[0]!.mutation_id = START;
    db.mutations.push({
      subject: OWNER,
      session_id: SESSION,
      mutation_id: SET_MUTATION,
      mutation_kind: 'FINISH_SESSION',
      payload_json: '{}',
      depends_on_mutation_id: START,
    });
    await expect(
      cancelLocalFreeWorkout(db, auth().access, input()),
    ).rejects.toMatchObject({ code: 'alreadyTerminated' });
  });

  it('rolls back cancellation and outbox if audit insert fails', async () => {
    const db = new FakeCancelDb();
    db.failAuditWrite = true;
    await expect(
      cancelLocalFreeWorkout(db, auth().access, input()),
    ).rejects.toThrow('Disk full');
    expect(db.mutations).toHaveLength(1);
    expect(db.sessions.get(OWNER)?.lifecycle_state).toBe('active');
    expect(db.cancellations.size).toBe(0);
  });

  it('fences logout/account switch mid-transaction and rejects altered idempotent retries', async () => {
    const db = new FakeCancelDb();
    const identity = auth();
    db.onRead = () => {
      identity.switchTo(null);
      db.onRead = undefined;
    };
    await expect(
      cancelLocalFreeWorkout(db, identity.access, input()),
    ).rejects.toMatchObject({ code: 'notAuthenticated' });
    expect(db.mutations).toHaveLength(1);
    expect(db.sessions.get(OWNER)?.lifecycle_state).toBe('active');
    await cancelLocalFreeWorkout(db, auth().access, input());
    await expect(
      cancelLocalFreeWorkout(db, auth().access, {
        ...input(),
        cancelledAtUtc: '2026-10-09T15:01:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'mutationConflict' });
  });
});
