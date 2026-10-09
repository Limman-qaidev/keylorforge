import { requestApi } from '../../api/client';
import type { SqliteQueryPort, SqliteWorkoutPort } from '../local-schema';
import { syncNextPendingConfirmedSet } from '../confirmed-set-sync';
import type { StartSyncAccess } from '../start-session-sync';

jest.mock('../../api/client', () => ({ requestApi: jest.fn() }));

const SUBJECT = 'a3dbf764-e0e3-41aa-9895-6e58eadfbb14';
const OTHER = 'e426dd13-344a-4b69-8920-cb014715c6c1';
const SESSION = '1f2d27bc-4904-4f4f-9367-39565d78f211';
const START = 'bf6ba981-334f-4d88-b081-c74d65b940fa';
const FIRST = 'b5bd2f11-4a2f-4c39-83bf-e4c783649b87';
const SECOND = '657273f7-1e04-4a6b-b8a3-6e9900e51923';
const OCC = '07e79fca-b83e-4a96-bd5d-ed265535a8d6';
const EXERCISE = '683a7ca9-1812-4dbb-a85a-1469459a8715';
const SET_FIRST = '5d3c79ea-82c3-42c3-95d8-7c417e966ef3';
const SET_SECOND = '0134b84d-54b1-4daa-995d-0c49b38b5d18';
const DATE = '2026-10-09T07:15:00.000Z';

type OutboxRow = {
  subject: string;
  session_id: string;
  mutation_id: string;
  mutation_kind: string;
  protocol_version: number;
  payload_json: string;
  delivery_state: string;
  depends_on_mutation_id: string | null;
};
type Performed = {
  subject: string;
  session_id: string;
  set_id: string;
  occurrence_id: string;
  mutation_id: string;
  set_role: string;
  measurement_type: string;
  reps: number;
  duration_seconds: null;
  distance_decimal: null;
  distance_unit: null;
  load_decimal: string;
  load_unit: string;
  load_entry_semantics: string;
  machine_profile_id: null;
  machine_configuration_id: null;
  machine_snapshot_json: null;
  target_at_confirmation_json: null;
  completed_at_utc: string;
};

function createCommand(first: boolean) {
  return {
    protocol_version: 1,
    kind: first
      ? 'CONFIRM_FIRST_SET_WITH_OCCURRENCE'
      : 'CONFIRM_ADDITIONAL_SET',
    session_id: SESSION,
    mutation_id: first ? FIRST : SECOND,
    set_id: first ? SET_FIRST : SET_SECOND,
    occurrence_id: OCC,
    canonical_exercise_id: EXERCISE,
    agenda_item_id: null,
    actual_order: 0,
    set_role: first ? 'WARMUP' : 'WORKING',
    measurement: { measurementType: 'reps', reps: first ? 12 : 8 },
    load: {
      decimal: first ? '20.5' : '27.5',
      unit: first ? 'kg' : 'lb',
      entrySemantics: 'total',
    },
    machine: null,
    target_at_confirmation: null,
    completed_at: DATE,
  };
}
function localSet(first: boolean): Performed {
  return {
    subject: SUBJECT,
    session_id: SESSION,
    set_id: first ? SET_FIRST : SET_SECOND,
    occurrence_id: OCC,
    mutation_id: first ? FIRST : SECOND,
    set_role: first ? 'WARMUP' : 'WORKING',
    measurement_type: 'reps',
    reps: first ? 12 : 8,
    duration_seconds: null,
    distance_decimal: null,
    distance_unit: null,
    load_decimal: first ? '20.5' : '27.5',
    load_unit: first ? 'kg' : 'lb',
    load_entry_semantics: 'total',
    machine_profile_id: null,
    machine_configuration_id: null,
    machine_snapshot_json: null,
    target_at_confirmation_json: null,
    completed_at_utc: DATE,
  };
}
function serverResponse(
  first: boolean,
  change: Record<string, unknown> = {},
): Response {
  return {
    status: 201,
    json: async () => ({
      session_id: SESSION,
      occurrence_id: OCC,
      set_id: first ? SET_FIRST : SET_SECOND,
      mutation_id: first ? FIRST : SECOND,
      set_role: first ? 'WARMUP' : 'WORKING',
      measurement_type: 'reps',
      completed_at: '2026-10-09T07:15:00+00:00',
      load_decimal: first ? '20.500' : '27.500',
      load_unit: first ? 'kg' : 'lb',
      machine_profile_id: null,
      ...change,
    }),
  } as Response;
}
function account() {
  let current: string | null = SUBJECT;
  const access: StartSyncAccess = {
    currentAuthenticatedSubject: () => current,
    acquireCurrentCredentials: async () => ({
      subject: SUBJECT,
      accessToken: 'user-token',
    }),
  };
  return {
    access,
    switchTo: (value: string | null) => {
      current = value;
    },
  };
}

class FakeDB implements SqliteWorkoutPort {
  readonly rows = new Map<string, OutboxRow>();
  readonly sets = new Map<string, Performed>();
  failWrite = false;
  onWrite?: () => void;

  constructor() {
    this.rows.set(START, {
      subject: SUBJECT,
      session_id: SESSION,
      mutation_id: START,
      mutation_kind: 'START_SESSION',
      payload_json: '{}',
      protocol_version: 1,
      delivery_state: 'acknowledged',
      depends_on_mutation_id: null,
    });
    for (const first of [true, false]) {
      const cmd = createCommand(first);
      this.rows.set(cmd.mutation_id, {
        subject: SUBJECT,
        session_id: SESSION,
        mutation_id: cmd.mutation_id,
        mutation_kind: cmd.kind,
        protocol_version: 1,
        payload_json: JSON.stringify(cmd),
        delivery_state: 'pending',
        depends_on_mutation_id: first ? START : FIRST,
      });
      this.sets.set(cmd.mutation_id, localSet(first));
    }
  }

  async execAsync(): Promise<void> {}
  async getFirstAsync<T>(
    sql: string,
    ...args: (string | number | null)[]
  ): Promise<T | null> {
    if (sql.includes('mutation_kind IN')) {
      return ([...this.rows.values()].find(
        (x) =>
          x.subject === args[0] &&
          x.mutation_kind !== 'START_SESSION' &&
          x.delivery_state === 'pending',
      ) ?? null) as T | null;
    }
    if (sql.includes('FROM local_workout_outbox')) {
      const row = this.rows.get(String(args[1]));
      return (row?.subject === args[0] ? { ...row } : null) as T | null;
    }
    if (sql.includes('FROM local_workout_sets')) {
      return (
        args[0] === SUBJECT ? (this.sets.get(String(args[1])) ?? null) : null
      ) as T | null;
    }
    if (sql.includes('FROM local_workout_occurrences')) {
      return (
        args[0] === SUBJECT && args[1] === SESSION && args[2] === OCC
          ? {
              canonical_exercise_id: EXERCISE,
              agenda_item_id: null,
              actual_order: 0,
              first_set_id: SET_FIRST,
            }
          : null
      ) as T | null;
    }
    throw new Error('Unexpected SELECT');
  }
  async runAsync(
    sql: string,
    ...args: (string | number | null)[]
  ): Promise<unknown> {
    if (!sql.includes('UPDATE local_workout_outbox'))
      throw new Error('Unexpected UPDATE');
    if (this.failWrite) {
      this.failWrite = false;
      throw new Error('disk full');
    }
    const [next, subject, mutation] = args;
    const found = this.rows.get(String(mutation));
    if (found && found.subject === subject && found.delivery_state === 'pending') {
      found.delivery_state = String(next);
    }
    this.onWrite?.();
    return undefined;
  }
  async withExclusiveTransactionAsync(
    action: (tx: SqliteQueryPort) => Promise<void>,
  ): Promise<void> {
    const backup = new Map([...this.rows].map(([id, row]) => [id, { ...row }]));
    try {
      await action(this);
    } catch (error) {
      this.rows.clear();
      backup.forEach((row, id) => this.rows.set(id, row));
      throw error;
    }
  }
  state(id: string): string {
    return this.rows.get(id)!.delivery_state;
  }
  command(id: string): Record<string, unknown> {
    return JSON.parse(this.rows.get(id)!.payload_json) as Record<
      string,
      unknown
    >;
  }
  modify(id: string, fn: (command: Record<string, unknown>) => void): void {
    const command = this.command(id);
    fn(command);
    this.rows.get(id)!.payload_json = JSON.stringify(command);
  }
}

describe('M3 causally sequenced confirmed-set transport', () => {
  beforeEach(() => {
    jest.mocked(requestApi).mockReset();
    jest.mocked(requestApi).mockResolvedValue(serverResponse(true));
  });
  it('sends first set only after START ACK and then additional set in order', async () => {
    const db = new FakeDB();
    expect(await syncNextPendingConfirmedSet(db, account().access)).toEqual({
      state: 'acknowledged',
      mutationId: FIRST,
    });
    const [path, init] = jest.mocked(requestApi).mock.calls[0]!;
    expect(path).toBe(`/workout-sessions/${SESSION}/sets/first`);
    expect(init?.body).toBe(db.rows.get(FIRST)!.payload_json);
    expect(db.state(FIRST)).toBe('acknowledged');
    expect(db.state(SECOND)).toBe('pending');
    jest.mocked(requestApi).mockResolvedValue(serverResponse(false));
    expect(await syncNextPendingConfirmedSet(db, account().access)).toEqual({
      state: 'acknowledged',
      mutationId: SECOND,
    });
    expect(jest.mocked(requestApi).mock.calls[1]![0]).toBe(
      `/workout-sessions/${SESSION}/sets/additional`,
    );
    expect(db.state(SECOND)).toBe('acknowledged');
    expect(await syncNextPendingConfirmedSet(db, account().access)).toEqual({
      state: 'idle',
    });
  });
  it('does not bypass unacknowledged start or previous set', async () => {
    const db = new FakeDB();
    db.rows.get(START)!.delivery_state = 'pending';
    expect(await syncNextPendingConfirmedSet(db, account().access)).toEqual({
      state: 'blocked',
      reason: 'dependency',
    });
    expect(requestApi).not.toHaveBeenCalled();
    db.rows.get(START)!.delivery_state = 'acknowledged';
    db.rows.get(FIRST)!.delivery_state = 'conflict';
    expect(await syncNextPendingConfirmedSet(db, account().access)).toEqual({
      state: 'blocked',
      reason: 'dependency',
    });
    expect(db.state(SECOND)).toBe('pending');
  });
  it('never sends machine, agenda or unsourced target dependencies', async () => {
    for (const prop of [
      'machine',
      'agenda_item_id',
      'target_at_confirmation',
    ]) {
      const db = new FakeDB();
      db.modify(FIRST, (cmd) => {
        cmd[prop] =
          prop === 'agenda_item_id' ? EXERCISE : { profileId: EXERCISE };
      });
      expect(await syncNextPendingConfirmedSet(db, account().access)).toEqual({
        state: 'blocked',
        reason: prop === 'agenda_item_id' ? 'localData' : 'unsupported',
      });
      expect(requestApi).not.toHaveBeenCalled();
    }
  });
  it('detects altered performed set intent before network transmission', async () => {
    const db = new FakeDB();
    db.modify(FIRST, (cmd) => {
      cmd.measurement = { measurementType: 'reps', reps: 300 };
    });
    expect(await syncNextPendingConfirmedSet(db, account().access)).toEqual({
      state: 'blocked',
      reason: 'localData',
    });
    expect(requestApi).not.toHaveBeenCalled();
  });
  it.each([
    { occurrence_id: EXERCISE },
    { mutation_id: START },
    { set_id: SET_SECOND },
    { set_role: 'WORKING' },
    { load_unit: 'lb' },
    { load_decimal: '999.000' },
    { completed_at: '2026-10-09T07:16:00Z' },
  ])(
    'does not acknowledge mismatching HTTP 201 receipt %j',
    async (invalid) => {
      const db = new FakeDB();
      jest.mocked(requestApi).mockResolvedValue(serverResponse(true, invalid));
      expect(await syncNextPendingConfirmedSet(db, account().access)).toEqual({
        state: 'retryable',
        reason: 'invalidResponse',
      });
      expect(db.state(FIRST)).toBe('pending');
    },
  );
  it.each([401, 403, 429, 500, 503, 409])(
    'handles HTTP %s without data loss',
    async (code) => {
      const db = new FakeDB();
      jest.mocked(requestApi).mockResolvedValue({ status: code } as Response);
      const result = await syncNextPendingConfirmedSet(db, account().access);
      if (code === 409) {
        expect(result).toEqual({ state: 'conflict', mutationId: FIRST });
        expect(db.state(FIRST)).toBe('conflict');
      } else {
        expect(result.state).toBe(
          code === 401 || code === 403 ? 'blocked' : 'retryable',
        );
        expect(db.state(FIRST)).toBe('pending');
      }
      expect(db.state(SECOND)).toBe('pending');
    },
  );
  it('replays original immutable operation after HTTP loss and failed ACK disk write', async () => {
    const db = new FakeDB();
    jest.mocked(requestApi).mockRejectedValueOnce(new Error('offline'));
    expect(
      (await syncNextPendingConfirmedSet(db, account().access)).state,
    ).toBe('retryable');
    db.failWrite = true;
    await expect(
      syncNextPendingConfirmedSet(db, account().access),
    ).rejects.toThrow('disk full');
    expect(db.state(FIRST)).toBe('pending');
    await syncNextPendingConfirmedSet(db, account().access);
    expect(db.state(FIRST)).toBe('acknowledged');
    const sent = jest.mocked(requestApi).mock.calls.map((x) => x[1]?.body);
    expect(sent[0]).toEqual(sent[1]);
    expect(sent[1]).toEqual(sent[2]);
  });
  it('rolls back ACK if authenticated subject changes during UPDATE', async () => {
    const db = new FakeDB();
    const auth = account();
    db.onWrite = () => auth.switchTo(OTHER);
    await expect(
      syncNextPendingConfirmedSet(db, auth.access),
    ).rejects.toMatchObject({
      code: 'notAuthenticated',
    });
    expect(db.state(FIRST)).toBe('pending');
  });
  it('never delivers from another account or sends the same row concurrently', async () => {
    const db = new FakeDB();
    const auth = account();
    auth.switchTo(OTHER);
    expect(await syncNextPendingConfirmedSet(db, auth.access)).toEqual({
      state: 'idle',
    });
    expect(requestApi).not.toHaveBeenCalled();
    auth.switchTo(SUBJECT);
    let finish: ((value: Response) => void) | undefined;
    jest.mocked(requestApi).mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const first = syncNextPendingConfirmedSet(db, auth.access);
    expect(await syncNextPendingConfirmedSet(db, auth.access)).toEqual({
      state: 'inFlight',
    });
    for (let i = 0; i < 9 && !finish; i += 1) await Promise.resolve();
    expect(finish).toBeDefined();
    finish!(serverResponse(true));
    expect((await first).state).toBe('acknowledged');
    expect(requestApi).toHaveBeenCalledTimes(1);
  });
});
