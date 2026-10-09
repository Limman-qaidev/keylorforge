import { requestApi } from '../../api/client';
import { syncNextPendingFinish } from '../finish-session-sync';
import type { LocalFinishRow } from '../local-finish';
import type { SqliteQueryPort, SqliteWorkoutPort } from '../local-schema';
import type { LocalWorkoutSession } from '../local-store';
import type { StartSyncAccess } from '../start-session-sync';

jest.mock('../../api/client', () => ({ requestApi: jest.fn() }));

const SUBJECT = 'b35c00d6-243c-4dea-a095-000000000132';
const OTHER = 'b35c00d6-243c-4dea-a095-000000000133';
const SESSION = '1f2d27bc-4904-4f4f-9367-39565d78f211';
const START = 'df493bd5-0a51-487a-bacb-ae1b3c7ec126';
const SET_MUTATION = 'fa3f8b27-e2a0-47bf-9850-531a51e8f955';
const FINISH = '0d72c629-6248-4221-8ab2-d9b9f1b63901';
const SNAPSHOT = '17e1a62d-965f-4caf-a509-c95ab2fe6438';
const OCCURRENCE = 'c226a777-d460-4d5f-bad6-f75667a9d022';
const EXERCISE = '502c4c87-80a5-4567-9aaf-296e43bfc4d1';
const SET_ID = '1b428bd6-781d-44ec-8609-57af594a5511';
const FINISHED_AT = '2026-10-09T15:00:00.000Z';

type OutboxRow = {
  subject: string;
  mutation_id: string;
  session_id: string;
  mutation_kind: string;
  protocol_version: number;
  payload_json: string;
  delivery_state: string;
  depends_on_mutation_id: string | null;
};

const snapshot = {
  schema_version: 1,
  completion_snapshot_id: SNAPSHOT,
  session_id: SESSION,
  origin: 'free',
  original_agenda: { schema_version: 1, origin: 'free', items: [] },
  final_agenda_revision: 0,
  applied_agenda_change_ids: [],
  agenda_items: [],
  unplanned_performed_occurrences: [
    {
      occurrence_id: OCCURRENCE,
      canonical_exercise_id: EXERCISE,
      actual_order: 0,
      agenda_item_id: null,
      set_ids: [SET_ID],
    },
  ],
  finished_at_utc: FINISHED_AT,
  time_zone: 'Europe/Madrid',
  local_date: '2026-10-09',
};

function access() {
  let current: string | null = SUBJECT;
  const credentials: StartSyncAccess = {
    currentAuthenticatedSubject: () => current,
    acquireCurrentCredentials: async () => ({
      subject: SUBJECT,
      accessToken: 'transient-token',
    }),
  };
  return {
    credentials,
    switchTo(next: string | null) {
      current = next;
    },
  };
}

class FakeFinishDb implements SqliteWorkoutPort {
  readonly rows = new Map<string, OutboxRow>();
  readonly finished: LocalFinishRow = {
    subject: SUBJECT,
    session_id: SESSION,
    finish_mutation_id: FINISH,
    completion_snapshot_id: SNAPSHOT,
    finished_at_utc: FINISHED_AT,
    final_agenda_json: JSON.stringify(snapshot),
  };
  readonly session: LocalWorkoutSession = {
    subject: SUBJECT,
    session_id: SESSION,
    lifecycle_state: 'completed',
    origin: 'free',
    started_at_utc: '2026-10-09T14:00:00.000Z',
    time_zone: 'Europe/Madrid',
    utc_offset_minutes: 120,
    local_date: '2026-10-09',
    agenda_revision: 0,
    original_agenda_json: JSON.stringify(snapshot.original_agenda),
  };
  errorOnWrite = false;
  onWrite?: () => void;

  constructor() {
    this.rows.set(START, this.makeRow(START, 'START_SESSION', null));
    this.rows.set(
      SET_MUTATION,
      this.makeRow(SET_MUTATION, 'CONFIRM_FIRST_SET_WITH_OCCURRENCE', START),
    );
    this.rows.set(FINISH, this.makeRow(FINISH, 'FINISH_SESSION', SET_MUTATION));
  }

  private makeRow(
    id: string,
    kind: string,
    parent: string | null,
  ): OutboxRow {
    return {
      subject: SUBJECT,
      mutation_id: id,
      session_id: SESSION,
      mutation_kind: kind,
      protocol_version: 1,
      payload_json:
        kind === 'FINISH_SESSION'
          ? JSON.stringify({
              protocol_version: 1,
              kind,
              session_id: SESSION,
              mutation_id: FINISH,
              completion_snapshot: snapshot,
            })
          : '{}',
      delivery_state: kind === 'FINISH_SESSION' ? 'pending' : 'acknowledged',
      depends_on_mutation_id: parent,
    };
  }

  async execAsync(): Promise<void> {}

  async getFirstAsync<T>(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<T | null> {
    const subject = String(params[0]);
    const selected = String(params[1]);
    let result: unknown = null;
    if (sql.includes("mutation_kind = 'FINISH_SESSION'")) {
      result = [...this.rows.values()].find(
        (row) =>
          row.subject === subject &&
          row.mutation_kind === 'FINISH_SESSION' &&
          row.delivery_state === 'pending',
      );
    } else if (sql.includes('COUNT(*) AS count')) {
      result = {
        count: [...this.rows.values()].filter(
          (row) =>
            row.subject === subject &&
            row.session_id === selected &&
            row.mutation_kind !== 'FINISH_SESSION' &&
            row.delivery_state !== 'acknowledged',
        ).length,
      };
    } else if (sql.includes('FROM local_workout_outbox')) {
      result = this.rows.get(selected);
      if ((result as OutboxRow | undefined)?.subject !== subject) result = null;
    } else if (sql.includes('FROM local_workout_final_snapshots')) {
      result =
        subject === this.finished.subject && selected === SESSION
          ? this.finished
          : null;
    } else if (sql.includes('FROM local_workout_sessions')) {
      result =
        subject === this.session.subject && selected === SESSION
          ? this.session
          : null;
    } else {
      throw new Error('Unexpected SQLite query: ' + sql);
    }
    return (result ?? null) as T | null;
  }

  async runAsync(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<unknown> {
    if (!sql.startsWith('UPDATE local_workout_outbox')) {
      throw new Error('Unexpected SQL mutation: ' + sql);
    }
    if (this.errorOnWrite) throw new Error('SQLite busy');
    const [state, subject, mutation] = params;
    const row = this.rows.get(String(mutation));
    if (row?.subject === subject && row.delivery_state === 'pending') {
      this.rows.set(String(mutation), {
        ...row,
        delivery_state: String(state),
      });
    }
    this.onWrite?.();
    return undefined;
  }

  async withExclusiveTransactionAsync(
    task: (tx: SqliteQueryPort) => Promise<void>,
  ): Promise<void> {
    const before = new Map(this.rows);
    try {
      await task(this);
    } catch (error) {
      this.rows.clear();
      for (const [key, value] of before) this.rows.set(key, value);
      throw error;
    }
  }
}

function receipt(change: Record<string, unknown> = {}): Response {
  return {
    status: 201,
    json: async () => ({
      session_id: SESSION,
      mutation_id: FINISH,
      completion_snapshot_id: SNAPSHOT,
      lifecycle_state: 'completed',
      completed_at: '2026-10-09T15:00:00+00:00',
      ...change,
    }),
  } as Response;
}

describe('account-fenced manual FINISH_SESSION HTTP transport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(requestApi).mockResolvedValue(receipt());
  });

  it('only ACKs the exact authoritative server receipt in SQLite', async () => {
    const db = new FakeFinishDb();
    const auth = access();
    expect(await syncNextPendingFinish(db, auth.credentials)).toEqual({
      state: 'acknowledged',
      mutationId: FINISH,
    });
    expect(db.rows.get(FINISH)?.delivery_state).toBe('acknowledged');
    expect(db.rows.get(SET_MUTATION)?.delivery_state).toBe('acknowledged');
    expect(db.finished.final_agenda_json).toEqual(JSON.stringify(snapshot));
    const [path, config] = jest.mocked(requestApi).mock.calls[0]!;
    expect(path).toBe('/workout-sessions/' + SESSION + '/finish');
    expect(config?.headers).toMatchObject({
      Authorization: 'Bearer transient-token',
    });
    expect(config?.body).toBe(db.rows.get(FINISH)?.payload_json);
    expect(db.finished.final_agenda_json).not.toContain('transient-token');
    expect(await syncNextPendingFinish(db, auth.credentials)).toEqual({
      state: 'idle',
    });
  });

  it('never sends FINISH while any preceding session outbox is not ACKed', async () => {
    const db = new FakeFinishDb();
    db.rows.set(SET_MUTATION, {
      ...db.rows.get(SET_MUTATION)!,
      delivery_state: 'pending',
    });
    expect(await syncNextPendingFinish(db, access().credentials)).toEqual({
      state: 'blocked',
      reason: 'dependency',
    });
    expect(requestApi).not.toHaveBeenCalled();
    expect(db.rows.get(FINISH)?.delivery_state).toBe('pending');
    db.rows.set(SET_MUTATION, {
      ...db.rows.get(SET_MUTATION)!,
      delivery_state: 'acknowledged',
    });
    db.rows.set(START, {
      ...db.rows.get(START)!,
      delivery_state: 'blocked',
    });
    expect(await syncNextPendingFinish(db, access().credentials)).toEqual({
      state: 'blocked',
      reason: 'dependency',
    });
    expect(requestApi).not.toHaveBeenCalled();
  });

  it('checks immutable snapshot, previous parent and completed session before HTTP', async () => {
    const db = new FakeFinishDb();
    const old = db.rows.get(FINISH)!;
    db.rows.set(FINISH, { ...old, payload_json: '{}' });
    expect(await syncNextPendingFinish(db, access().credentials)).toEqual({
      state: 'blocked',
      reason: 'localData',
    });
    expect(requestApi).not.toHaveBeenCalled();
    db.rows.set(FINISH, old);
    db.session.lifecycle_state = 'active';
    expect(await syncNextPendingFinish(db, access().credentials)).toEqual({
      state: 'blocked',
      reason: 'localData',
    });
    db.session.lifecycle_state = 'completed';
    db.rows.set(FINISH, { ...old, depends_on_mutation_id: OTHER });
    expect(await syncNextPendingFinish(db, access().credentials)).toEqual({
      state: 'blocked',
      reason: 'dependency',
    });
    expect(requestApi).not.toHaveBeenCalled();
  });

  it('does not ACK an invalid receipt or lost HTTP response', async () => {
    const db = new FakeFinishDb();
    jest.mocked(requestApi).mockResolvedValueOnce(
      receipt({ completion_snapshot_id: OTHER }),
    );
    expect(await syncNextPendingFinish(db, access().credentials)).toEqual({
      state: 'retryable',
      reason: 'invalidResponse',
    });
    expect(db.rows.get(FINISH)?.delivery_state).toBe('pending');
    jest.mocked(requestApi).mockRejectedValueOnce(new Error('offline'));
    expect(await syncNextPendingFinish(db, access().credentials)).toEqual({
      state: 'retryable',
      reason: 'network',
    });
    expect(db.rows.get(FINISH)?.delivery_state).toBe('pending');
    expect(await syncNextPendingFinish(db, access().credentials)).toEqual({
      state: 'acknowledged',
      mutationId: FINISH,
    });
  });

  it('classifies authentication, server errors and conflicts without deleting history', async () => {
    const db = new FakeFinishDb();
    for (const [status, expected] of [
      [401, { state: 'blocked', reason: 'auth' }],
      [503, { state: 'retryable', reason: 'server' }],
    ] as const) {
      jest.mocked(requestApi).mockResolvedValueOnce({ status } as Response);
      expect(await syncNextPendingFinish(db, access().credentials)).toEqual(
        expected,
      );
      expect(db.rows.get(FINISH)?.delivery_state).toBe('pending');
    }
    jest.mocked(requestApi).mockResolvedValueOnce({ status: 409 } as Response);
    expect(await syncNextPendingFinish(db, access().credentials)).toEqual({
      state: 'conflict',
      mutationId: FINISH,
    });
    expect(db.rows.get(FINISH)?.delivery_state).toBe('conflict');
    expect(db.session.lifecycle_state).toBe('completed');
    expect(db.finished.final_agenda_json).toEqual(JSON.stringify(snapshot));
  });

  it('rolls back the ACK when disk writing fails or subject changes mid-transaction', async () => {
    const failed = new FakeFinishDb();
    failed.errorOnWrite = true;
    await expect(
      syncNextPendingFinish(failed, access().credentials),
    ).rejects.toThrow('SQLite busy');
    expect(failed.rows.get(FINISH)?.delivery_state).toBe('pending');

    const switched = new FakeFinishDb();
    const auth = access();
    switched.onWrite = () => auth.switchTo(OTHER);
    await expect(
      syncNextPendingFinish(switched, auth.credentials),
    ).rejects.toMatchObject({ code: 'notAuthenticated' });
    expect(switched.rows.get(FINISH)?.delivery_state).toBe('pending');
  });

  it('rejects authentication mismatch and stale user switch during network I/O', async () => {
    const wrongAccount = access();
    wrongAccount.switchTo(OTHER);
    expect(await syncNextPendingFinish(new FakeFinishDb(), wrongAccount.credentials))
      .toEqual({ state: 'idle' });
    expect(requestApi).not.toHaveBeenCalled();

    const auth = access();
    jest.mocked(requestApi).mockImplementationOnce(async () => {
      auth.switchTo(OTHER);
      return receipt();
    });
    const db = new FakeFinishDb();
    await expect(
      syncNextPendingFinish(db, auth.credentials),
    ).rejects.toMatchObject({ code: 'notAuthenticated' });
    expect(db.rows.get(FINISH)?.delivery_state).toBe('pending');
  });
});
