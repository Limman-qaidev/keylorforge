import { requestApi } from '../../api/client';
import { LocalWorkoutError } from '../local-store';
import type { SqliteQueryPort, SqliteWorkoutPort } from '../local-schema';
import {
  syncNextPendingStart,
  type StartSyncAccess,
} from '../start-session-sync';

jest.mock('../../api/client', () => ({ requestApi: jest.fn() }));

const A = 'a3dbf764-e0e3-41aa-9895-6e58eadfbb14';
const B = 'e426dd13-344a-4b69-8920-cb014715c6c1';
const SESSION = '1f2d27bc-4904-4f4f-9367-39565d78f211';
const MUTATION = 'bf6ba981-334f-4d88-b081-c74d65b940fa';
const payload = {
  protocol_version: 1,
  session_id: SESSION,
  mutation_id: MUTATION,
  started_at: '2026-10-08T14:30:00.000Z',
  time_zone: 'Europe/Madrid',
};
const session = {
  subject: A,
  session_id: SESSION,
  lifecycle_state: 'active' as const,
  origin: 'free' as const,
  started_at_utc: payload.started_at,
  time_zone: 'Europe/Madrid',
  utc_offset_minutes: 120,
  local_date: '2026-10-08',
  original_agenda_json: '{}',
  agenda_revision: 0,
};
type Row = {
  subject: string;
  mutation_id: string;
  session_id: string;
  mutation_kind: string;
  protocol_version: number;
  payload_json: string;
  delivery_state: string;
};

class FakeDB implements SqliteWorkoutPort {
  readonly outbox = new Map<string, Row>();
  failUpdate = false;
  onRead?: () => void;
  onUpdate?: () => void;
  constructor() {
    this.outbox.set(MUTATION, {
      subject: A,
      mutation_id: MUTATION,
      session_id: SESSION,
      mutation_kind: 'START_SESSION',
      protocol_version: 1,
      payload_json: JSON.stringify(payload),
      delivery_state: 'pending',
    });
    this.outbox.set('set-child', {
      subject: A,
      mutation_id: 'set-child',
      session_id: SESSION,
      mutation_kind: 'CONFIRM_FIRST_SET_WITH_OCCURRENCE',
      protocol_version: 1,
      payload_json: '{}',
      delivery_state: 'pending',
    });
    this.outbox.set('other', {
      subject: B,
      mutation_id: 'other',
      session_id: SESSION,
      mutation_kind: 'START_SESSION',
      protocol_version: 1,
      payload_json: '{}',
      delivery_state: 'pending',
    });
  }
  state(key = MUTATION): string {
    return this.outbox.get(key)!.delivery_state;
  }
  async execAsync(): Promise<void> {}
  async getFirstAsync<T>(
    sql: string,
    ...args: (string | number | null)[]
  ): Promise<T | null> {
    this.onRead?.();
    if (sql.includes('FROM local_workout_sessions')) {
      return (
        args[0] === A && args[1] === SESSION ? { ...session } : null
      ) as T | null;
    }
    if (sql.includes("mutation_kind = 'START_SESSION'")) {
      return ([...this.outbox.values()].find(
        (x) =>
          x.subject === args[0] &&
          x.mutation_kind === 'START_SESSION' &&
          x.delivery_state === 'pending',
      ) ?? null) as T | null;
    }
    if (sql.includes('FROM local_workout_outbox')) {
      const row = this.outbox.get(String(args[1]));
      return (row?.subject === args[0] ? { ...row } : null) as T | null;
    }
    throw new Error('Unknown SELECT');
  }
  async runAsync(
    sql: string,
    ...args: (string | number | null)[]
  ): Promise<unknown> {
    if (!sql.includes('UPDATE local_workout_outbox'))
      throw new Error('Unknown UPDATE');
    if (this.failUpdate) {
      this.failUpdate = false;
      throw new Error('disk full');
    }
    const [state, subject, id] = args;
    const row = this.outbox.get(String(id));
    if (row && row.subject === subject && row.delivery_state === 'pending') {
      row.delivery_state = String(state);
    }
    this.onUpdate?.();
    return undefined;
  }
  async withExclusiveTransactionAsync(
    f: (tx: SqliteQueryPort) => Promise<void>,
  ): Promise<void> {
    const saved = new Map(
      [...this.outbox].map(([id, row]) => [id, { ...row }]),
    );
    try {
      await f(this);
    } catch (error) {
      this.outbox.clear();
      saved.forEach((row, id) => this.outbox.set(id, row));
      throw error;
    }
  }
}

function auth() {
  let subject: string | null = A;
  let token: string | null = 'test-token';
  const access: StartSyncAccess = {
    currentAuthenticatedSubject: () => subject,
    acquireCurrentCredentials: async () =>
      token ? { subject: A, accessToken: token } : null,
  };
  return {
    access,
    change: (next: string | null) => {
      subject = next;
    },
    noToken: () => {
      token = null;
    },
  };
}

function response(
  status = 201,
  overrides: Record<string, unknown> = {},
): Response {
  return {
    status,
    json: async () => ({
      id: SESSION,
      origin: 'free',
      lifecycle_state: 'active',
      started_at: '2026-10-08T14:30:00+00:00',
      time_zone: 'Europe/Madrid',
      utc_offset_minutes: 120,
      local_date: '2026-10-08',
      agenda_revision: 0,
      ...overrides,
    }),
  } as Response;
}

describe('M3 START_SESSION real HTTP / offline outbox reconciliation', () => {
  beforeEach(() => {
    jest.mocked(requestApi).mockReset();
    jest.mocked(requestApi).mockResolvedValue(response());
  });

  it('sends immutable stored bytes and ACKs only the correct account START', async () => {
    const db = new FakeDB();
    expect(await syncNextPendingStart(db, auth().access)).toEqual({
      state: 'acknowledged',
      mutationId: MUTATION,
    });
    const [path, init] = jest.mocked(requestApi).mock.calls[0]!;
    expect(path).toBe('/workout-sessions/start');
    expect(init?.body).toBe(JSON.stringify(payload));
    expect(init?.headers).toEqual({
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    });
    expect(db.state()).toBe('acknowledged');
    expect(db.state('set-child')).toBe('pending');
    expect(db.state('other')).toBe('pending');
    expect(await syncNextPendingStart(db, auth().access)).toEqual({
      state: 'idle',
    });
  });

  it('recovers lost remote acknowledgement by replaying exact mutation UUID', async () => {
    const db = new FakeDB();
    jest.mocked(requestApi).mockRejectedValueOnce(new Error('offline'));
    expect(await syncNextPendingStart(db, auth().access)).toEqual({
      state: 'retryable',
      reason: 'network',
    });
    expect(db.state()).toBe('pending');
    await syncNextPendingStart(db, auth().access);
    expect(db.state()).toBe('acknowledged');
    expect(jest.mocked(requestApi).mock.calls[0]![1]?.body).toEqual(
      jest.mocked(requestApi).mock.calls[1]![1]?.body,
    );
  });

  it.each([429, 500, 503])('retains pending after HTTP %i', async (code) => {
    const db = new FakeDB();
    jest.mocked(requestApi).mockResolvedValue(response(code));
    expect(await syncNextPendingStart(db, auth().access)).toEqual({
      state: 'retryable',
      reason: 'server',
    });
    expect(db.state()).toBe('pending');
  });

  it.each([401, 403])('preserves pending on auth HTTP %i', async (code) => {
    const db = new FakeDB();
    jest.mocked(requestApi).mockResolvedValue(response(code));
    expect(await syncNextPendingStart(db, auth().access)).toEqual({
      state: 'blocked',
      reason: 'auth',
    });
    expect(db.state()).toBe('pending');
  });

  it('records a 409 conflict without modifying the dependent set', async () => {
    const db = new FakeDB();
    jest.mocked(requestApi).mockResolvedValue(response(409));
    expect(await syncNextPendingStart(db, auth().access)).toEqual({
      state: 'conflict',
      mutationId: MUTATION,
    });
    expect(db.state()).toBe('conflict');
    expect(db.state('set-child')).toBe('pending');
  });

  it.each([
    { id: '435d0f3a-16c7-47db-b97a-0b4ae1bbabf7' },
    { started_at: '2026-10-08T14:30:01+00:00' },
    { origin: 'planned' },
    { time_zone: 'UTC' },
    { utc_offset_minutes: 0 },
    { agenda_revision: 1 },
  ])('refuses a mismatching 201 receipt %j', async (bad) => {
    const db = new FakeDB();
    jest.mocked(requestApi).mockResolvedValue(response(201, bad));
    expect(await syncNextPendingStart(db, auth().access)).toEqual({
      state: 'retryable',
      reason: 'invalidResponse',
    });
    expect(db.state()).toBe('pending');
  });

  it('does not ACK missing/malformed response JSON', async () => {
    const db = new FakeDB();
    jest.mocked(requestApi).mockResolvedValue({
      status: 201,
      json: async () => {
        throw new Error('invalid JSON');
      },
    } as unknown as Response);
    expect(await syncNextPendingStart(db, auth().access)).toEqual({
      state: 'retryable',
      reason: 'invalidResponse',
    });
    expect(db.state()).toBe('pending');
  });

  it('blocks altered local commands, absent credentials and other accounts', async () => {
    const db = new FakeDB();
    db.outbox.get(MUTATION)!.payload_json = '{"corrupt":true}';
    expect(await syncNextPendingStart(db, auth().access)).toEqual({
      state: 'blocked',
      reason: 'localData',
    });
    expect(requestApi).not.toHaveBeenCalled();
    db.outbox.get(MUTATION)!.payload_json = JSON.stringify(payload);
    const account = auth();
    account.noToken();
    expect(await syncNextPendingStart(db, account.access)).toEqual({
      state: 'blocked',
      reason: 'auth',
    });
    expect(requestApi).not.toHaveBeenCalled();
  });

  it('does not send after account change during local SQLite read', async () => {
    const db = new FakeDB();
    const account = auth();
    db.onRead = () => account.change(B);
    await expect(
      syncNextPendingStart(db, account.access),
    ).rejects.toBeInstanceOf(LocalWorkoutError);
    expect(requestApi).not.toHaveBeenCalled();
    expect(db.state()).toBe('pending');
  });

  it('rolls back an ACK if sign-out occurs during the SQLite UPDATE', async () => {
    const db = new FakeDB();
    const account = auth();
    db.onUpdate = () => account.change(null);
    await expect(
      syncNextPendingStart(db, account.access),
    ).rejects.toMatchObject({
      code: 'notAuthenticated',
    });
    expect(db.state()).toBe('pending');
  });

  it('leaves original mutation pending when SQLite cannot save remote ACK', async () => {
    const db = new FakeDB();
    db.failUpdate = true;
    await expect(syncNextPendingStart(db, auth().access)).rejects.toThrow(
      'disk full',
    );
    expect(db.state()).toBe('pending');
    expect(await syncNextPendingStart(db, auth().access)).toEqual({
      state: 'acknowledged',
      mutationId: MUTATION,
    });
  });

  it('does not send two concurrent HTTP requests for the same SQLite DB', async () => {
    const db = new FakeDB();
    let finish: ((value: Response) => void) | undefined;
    jest.mocked(requestApi).mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const first = syncNextPendingStart(db, auth().access);
    expect(await syncNextPendingStart(db, auth().access)).toEqual({
      state: 'inFlight',
    });
    for (let i = 0; i < 8 && !finish; i += 1) await Promise.resolve();
    expect(finish).toBeDefined();
    finish!(response());
    await expect(first).resolves.toEqual({
      state: 'acknowledged',
      mutationId: MUTATION,
    });
    expect(requestApi).toHaveBeenCalledTimes(1);
  });
});
