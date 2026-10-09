import { requestApi } from '../../api/client';
import { syncNextPendingCancel } from '../cancel-session-sync';
import type { LocalCancelRow } from '../local-cancel';
import type { SqliteQueryPort, SqliteWorkoutPort } from '../local-schema';
import type { LocalWorkoutSession } from '../local-store';
import type { StartSyncAccess } from '../start-session-sync';

jest.mock('../../api/client', () => ({ requestApi: jest.fn() }));

const SUBJECT = 'a3dbf764-e0e3-41aa-9895-6e58eadfbb14';
const OTHER = 'e426dd13-344a-4b69-8920-cb014715c6c1';
const SESSION = '1f2d27bc-4904-4f4f-9367-39565d78f211';
const START = '1b428bd6-781d-44ec-8609-57af594a5511';
const SET = 'c226a777-d460-4d5f-bad6-f75667a9d022';
const CANCEL = '0d72c629-6248-4221-8ab2-d9b9f1b63901';
const WHEN = '2026-10-09T15:00:00.000Z';

type Row = {
  subject: string;
  mutation_id: string;
  session_id: string;
  mutation_kind: string;
  payload_json: string;
  protocol_version: number;
  delivery_state: string;
  depends_on_mutation_id: string | null;
};

function access() {
  let who: string | null = SUBJECT;
  return {
    auth: {
      currentAuthenticatedSubject: () => who,
      acquireCurrentCredentials: async () => ({
        subject: SUBJECT,
        accessToken: 'token-only-in-memory',
      }),
    } satisfies StartSyncAccess,
    switchTo(subject: string | null) {
      who = subject;
    },
  };
}
class Db implements SqliteWorkoutPort {
  rows: Row[] = [];
  sets = 1;
  failWrite = false;
  onWrite?: () => void;
  readonly cancellation: LocalCancelRow = {
    subject: SUBJECT,
    session_id: SESSION,
    cancel_mutation_id: CANCEL,
    cancelled_at_utc: WHEN,
    prior_confirmed_sets: 1,
  };
  readonly session: LocalWorkoutSession = {
    subject: SUBJECT,
    session_id: SESSION,
    lifecycle_state: 'cancelled',
    origin: 'free',
    started_at_utc: '2026-10-09T14:00:00.000Z',
    time_zone: 'Europe/Madrid',
    utc_offset_minutes: 120,
    local_date: '2026-10-09',
    original_agenda_json: '{"schema_version":1,"origin":"free","items":[]}',
    agenda_revision: 0,
  };
  constructor() {
    this.rows.push(this.row(START, 'START_SESSION', null));
    this.rows.push(this.row(SET, 'CONFIRM_FIRST_SET_WITH_OCCURRENCE', START));
    this.rows.push(this.row(CANCEL, 'CANCEL_SESSION', SET));
  }
  row(mutation: string, kind: string, parent: string | null): Row {
    return {
      subject: SUBJECT,
      mutation_id: mutation,
      session_id: SESSION,
      mutation_kind: kind,
      protocol_version: 1,
      payload_json:
        kind === 'CANCEL_SESSION'
          ? JSON.stringify({
              protocol_version: 1,
              kind,
              session_id: SESSION,
              mutation_id: CANCEL,
              cancelled_at_utc: WHEN,
              confirmed_set_count: 1,
              discard_performed_sets_confirmed: true,
            })
          : '{}',
      delivery_state: kind === 'CANCEL_SESSION' ? 'pending' : 'acknowledged',
      depends_on_mutation_id: parent,
    };
  }
  async execAsync(): Promise<void> {
    throw new Error('No schema write');
  }
  async getFirstAsync<T>(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<T | null> {
    const [subject, selected] = params;
    let value: unknown = null;
    if (sql.includes("mutation_kind = 'CANCEL_SESSION'")) {
      value = this.rows.find(
        (r) =>
          r.subject === subject &&
          r.mutation_kind === 'CANCEL_SESSION' &&
          r.delivery_state === 'pending',
      );
    } else if (sql.includes('COUNT(*)') && sql.includes('local_workout_outbox')) {
      value = {
        count: this.rows.filter(
          (r) =>
            r.subject === subject &&
            r.session_id === selected &&
            r.mutation_kind !== 'CANCEL_SESSION' &&
            r.delivery_state !== 'acknowledged',
        ).length,
      };
    } else if (sql.includes('FROM local_workout_outbox')) {
      value = this.rows.find((r) => r.subject === subject && r.mutation_id === selected);
    } else if (sql.includes('FROM local_workout_cancellations')) {
      value = subject === SUBJECT && selected === SESSION ? this.cancellation : null;
    } else if (sql.includes('FROM local_workout_sessions')) {
      value = subject === SUBJECT && selected === SESSION ? this.session : null;
    } else if (sql.includes('COUNT(*)') && sql.includes('local_workout_sets')) {
      value = { count: this.sets };
    } else {
      throw new Error('Unexpected query ' + sql);
    }
    return (value ?? null) as T | null;
  }
  async runAsync(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<unknown> {
    if (!sql.startsWith('UPDATE local_workout_outbox')) {
      throw new Error('Unexpected write');
    }
    if (this.failWrite) throw new Error('SQLite busy');
    const [state, subject, mutation] = params;
    const row = this.rows.find((r) => r.subject === subject && r.mutation_id === mutation);
    if (row && row.delivery_state === 'pending') {
      row.delivery_state = String(state);
    }
    this.onWrite?.();
    return undefined;
  }
  async withExclusiveTransactionAsync(
    task: (tx: SqliteQueryPort) => Promise<void>,
  ): Promise<void> {
    const saved = this.rows.map((r) => ({ ...r }));
    try {
      await task(this);
    } catch (error) {
      this.rows = saved;
      throw error;
    }
  }
}
function receipt(change: Record<string, unknown> = {}): Response {
  return {
    status: 201,
    json: async () => ({
      session_id: SESSION,
      mutation_id: CANCEL,
      lifecycle_state: 'cancelled',
      cancelled_at: '2026-10-09T15:00:00+00:00',
      confirmed_set_count: 1,
      ...change,
    }),
  } as Response;
}

describe('owner-fenced causal CANCEL_SESSION sender', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(requestApi).mockResolvedValue(receipt());
  });
  it('ACKs only validated server response and preserves prior set mutation', async () => {
    const db = new Db();
    expect(await syncNextPendingCancel(db, access().auth)).toEqual({
      state: 'acknowledged',
      mutationId: CANCEL,
    });
    expect(db.rows[2]?.delivery_state).toBe('acknowledged');
    expect(db.rows[1]?.delivery_state).toBe('acknowledged');
    const [path, options] = jest.mocked(requestApi).mock.calls[0]!;
    expect(path).toBe('/workout-sessions/' + SESSION + '/cancel');
    expect(options?.body).toBe(db.rows[2]?.payload_json);
    expect(options?.headers).toMatchObject({
      Authorization: 'Bearer token-only-in-memory',
    });
    expect(db.rows[2]?.payload_json).not.toContain('token-only-in-memory');
    expect(await syncNextPendingCancel(db, access().auth)).toEqual({
      state: 'idle',
    });
  });
  it('blocks unacknowledged preceding START, set and corrupted persisted cancellation', async () => {
    const db = new Db();
    db.rows[1]!.delivery_state = 'pending';
    expect(await syncNextPendingCancel(db, access().auth)).toEqual({
      state: 'blocked',
      reason: 'dependency',
    });
    db.rows[1]!.delivery_state = 'acknowledged';
    db.rows[0]!.delivery_state = 'blocked';
    expect(await syncNextPendingCancel(db, access().auth)).toEqual({
      state: 'blocked',
      reason: 'dependency',
    });
    db.rows[0]!.delivery_state = 'acknowledged';
    db.rows[2]!.payload_json = '{}';
    expect(await syncNextPendingCancel(db, access().auth)).toEqual({
      state: 'blocked',
      reason: 'localData',
    });
    expect(requestApi).not.toHaveBeenCalled();
  });
  it('retries network errors and incorrect receipts without changing cancellation state', async () => {
    const db = new Db();
    jest.mocked(requestApi).mockRejectedValueOnce(new Error('offline'));
    expect(await syncNextPendingCancel(db, access().auth)).toEqual({
      state: 'retryable',
      reason: 'network',
    });
    jest.mocked(requestApi).mockResolvedValueOnce(
      receipt({ confirmed_set_count: 0 }),
    );
    expect(await syncNextPendingCancel(db, access().auth)).toEqual({
      state: 'retryable',
      reason: 'invalidResponse',
    });
    expect(db.rows[2]?.delivery_state).toBe('pending');
    expect(await syncNextPendingCancel(db, access().auth)).toEqual({
      state: 'acknowledged',
      mutationId: CANCEL,
    });
  });
  it('distinguishes auth rejection, conflict and retryable server failures', async () => {
    const db = new Db();
    for (const [status, state, reason] of [
      [401, 'blocked', 'auth'],
      [503, 'retryable', 'server'],
    ] as const) {
      jest.mocked(requestApi).mockResolvedValueOnce({ status } as Response);
      expect(await syncNextPendingCancel(db, access().auth)).toEqual({
        state,
        reason,
      });
    }
    jest.mocked(requestApi).mockResolvedValueOnce({ status: 409 } as Response);
    expect(await syncNextPendingCancel(db, access().auth)).toEqual({
      state: 'conflict',
      mutationId: CANCEL,
    });
    expect(db.rows[2]?.delivery_state).toBe('conflict');
    expect(db.session.lifecycle_state).toBe('cancelled');
  });
  it('does not ACK if account changes or local SQLite fails after HTTP success', async () => {
    const db = new Db();
    const identity = access();
    db.failWrite = true;
    await expect(syncNextPendingCancel(db, identity.auth)).rejects.toThrow(
      'SQLite busy',
    );
    expect(db.rows[2]?.delivery_state).toBe('pending');
    db.failWrite = false;
    db.onWrite = () => identity.switchTo(OTHER);
    await expect(syncNextPendingCancel(db, identity.auth)).rejects.toThrow(
      'notAuthenticated',
    );
    expect(db.rows[2]?.delivery_state).toBe('pending');
  });
});
