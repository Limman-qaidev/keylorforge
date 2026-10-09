import { requestApi } from '../../api/client';
import { syncNextPendingMachineCreate } from '../machine-create-sync';
import type { SqliteQueryPort, SqliteWorkoutPort } from '../local-schema';
import type { StartSyncAccess } from '../start-session-sync';

jest.mock('../../api/client', () => ({ requestApi: jest.fn() }));

const A = 'a3dbf764-e0e3-41aa-9895-6e58eadfbb14';
const B = 'e426dd13-344a-4b69-8920-cb014715c6c1';
const PROFILE = '2d2bd42f-bebf-45d3-81b1-a89b8830872b';
const PROFILE_MUTATION = '0d72c629-6248-4221-8ab2-d9b9f1b63901';
const CONFIG = 'e6abfa2f-a26e-4202-a53f-56595568f189';
const CONFIG_MUTATION = 'fb3ee135-4e5f-4c9e-bd5d-2b162ad6c95d';
const DATE = '2026-10-09T08:00:00.000Z';
const profileCommand = {
  protocol_version: 1,
  kind: 'CREATE_MACHINE_PROFILE',
  mutation_id: PROFILE_MUTATION,
  profile_id: PROFILE,
  nickname: 'Polea A',
  catalog_equipment_id: null,
  manufacturer: null,
  model_name: null,
  native_load_unit: 'kg',
  load_entry_semantics: 'machine_display',
  technical_metadata: { source: 'user', geometry: { lever: null } },
  metadata_source: 'user_entered',
};
const configCommand = {
  protocol_version: 1,
  kind: 'CREATE_MACHINE_CONFIGURATION',
  mutation_id: CONFIG_MUTATION,
  configuration_id: CONFIG,
  profile_id: PROFILE,
  label: 'Polea alta',
  material_setup: { seat: 4, cable: 'top' },
  metadata_source: 'user_entered',
};
type Outbox = {
  subject: string;
  mutation_id: string;
  mutation_kind: string;
  profile_id: string;
  entity_id: string;
  protocol_version: number;
  payload_json: string;
  delivery_state: string;
  created_at_utc: string;
  depends_on_mutation_id: string | null;
};
type Entity = {
  subject: string;
  create_mutation_id: string;
  created_at_utc: string;
} & Record<string, unknown>;

class FakeDB implements SqliteWorkoutPort {
  rows = new Map<string, Outbox>();
  profiles = new Map<string, Entity>();
  configs = new Map<string, Entity>();
  failWrite = false;
  onRead?: () => void;
  onWrite?: () => void;
  constructor() {
    this.rows.set(PROFILE_MUTATION, {
      subject: A,
      mutation_id: PROFILE_MUTATION,
      mutation_kind: 'CREATE_MACHINE_PROFILE',
      profile_id: PROFILE,
      entity_id: PROFILE,
      protocol_version: 1,
      payload_json: JSON.stringify(profileCommand),
      delivery_state: 'pending',
      created_at_utc: DATE,
      depends_on_mutation_id: null,
    });
    this.rows.set(CONFIG_MUTATION, {
      subject: A,
      mutation_id: CONFIG_MUTATION,
      mutation_kind: 'CREATE_MACHINE_CONFIGURATION',
      profile_id: PROFILE,
      entity_id: CONFIG,
      protocol_version: 1,
      payload_json: JSON.stringify(configCommand),
      delivery_state: 'pending',
      created_at_utc: DATE,
      depends_on_mutation_id: PROFILE_MUTATION,
    });
    this.profiles.set(PROFILE, {
      subject: A,
      profile_id: PROFILE,
      create_mutation_id: PROFILE_MUTATION,
      nickname: 'Polea A',
      catalog_equipment_id: null,
      manufacturer: null,
      model_name: null,
      native_load_unit: 'kg',
      load_entry_semantics: 'machine_display',
      technical_metadata_json: JSON.stringify(
        profileCommand.technical_metadata,
      ),
      metadata_source: 'user_entered',
      created_at_utc: DATE,
    });
    this.configs.set(CONFIG, {
      subject: A,
      configuration_id: CONFIG,
      profile_id: PROFILE,
      create_mutation_id: CONFIG_MUTATION,
      label: 'Polea alta',
      material_setup_json: JSON.stringify(configCommand.material_setup),
      metadata_source: 'user_entered',
      created_at_utc: DATE,
    });
    // A different account may coexist on the device and must never be touched.
    this.rows.set('other-account', {
      subject: B,
      mutation_id: 'other-account',
      mutation_kind: 'CREATE_MACHINE_PROFILE',
      profile_id: PROFILE,
      entity_id: PROFILE,
      protocol_version: 1,
      payload_json: '{}',
      delivery_state: 'pending',
      created_at_utc: DATE,
      depends_on_mutation_id: null,
    });
  }
  state(id = PROFILE_MUTATION): string {
    return this.rows.get(id)!.delivery_state;
  }
  async execAsync(): Promise<void> {}
  async getFirstAsync<T>(
    sql: string,
    ...args: (string | number | null)[]
  ): Promise<T | null> {
    this.onRead?.();
    if (
      sql.includes("mutation_kind = 'CREATE_MACHINE_PROFILE'") ||
      sql.includes("mutation_kind = 'CREATE_MACHINE_CONFIGURATION'")
    ) {
      const kind = sql.includes("mutation_kind = 'CREATE_MACHINE_PROFILE'")
        ? 'CREATE_MACHINE_PROFILE'
        : 'CREATE_MACHINE_CONFIGURATION';
      return ([...this.rows.values()].find(
        (row) =>
          row.subject === args[0] &&
          row.mutation_kind === kind &&
          row.delivery_state === 'pending',
      ) ?? null) as T | null;
    }
    if (sql.includes('FROM local_machine_outbox')) {
      const row = this.rows.get(String(args[1]));
      return (row?.subject === args[0] ? { ...row } : null) as T | null;
    }
    if (sql.includes('FROM local_machine_profiles')) {
      const row = this.profiles.get(String(args[1]));
      return (row?.subject === args[0] ? { ...row } : null) as T | null;
    }
    if (sql.includes('FROM local_machine_configurations')) {
      const row = this.configs.get(String(args[1]));
      return (row?.subject === args[0] ? { ...row } : null) as T | null;
    }
    throw new Error('Unexpected SELECT: ' + sql);
  }
  async runAsync(
    sql: string,
    ...args: (string | number | null)[]
  ): Promise<unknown> {
    if (!sql.includes('UPDATE local_machine_outbox'))
      throw new Error('Unexpected UPDATE');
    if (this.failWrite) {
      this.failWrite = false;
      throw new Error('disk full');
    }
    const [next, subject, id] = args;
    const row = this.rows.get(String(id));
    if (row?.subject === subject && row.delivery_state === 'pending')
      row.delivery_state = String(next);
    this.onWrite?.();
    return undefined;
  }
  async withExclusiveTransactionAsync(
    action: (tx: SqliteQueryPort) => Promise<void>,
  ): Promise<void> {
    const backup = new Map(
      [...this.rows].map(([key, row]) => [key, { ...row }]),
    );
    try {
      await action(this);
    } catch (error) {
      this.rows = backup;
      throw error;
    }
  }
}
function auth() {
  let user: string | null = A;
  let token: string | null = 'access-token';
  let credentialSubject = A;
  const access: StartSyncAccess = {
    currentAuthenticatedSubject: () => user,
    acquireCurrentCredentials: async () =>
      token ? { subject: credentialSubject, accessToken: token } : null,
  };
  return {
    access,
    change: (next: string | null) => {
      user = next;
    },
    noToken: () => {
      token = null;
    },
    otherToken: () => {
      credentialSubject = B;
    },
  };
}
function profileResponse(
  changes: Record<string, unknown> = {},
  status = 201,
): Response {
  return {
    status,
    json: async () => ({
      id: PROFILE,
      nickname: 'Polea A',
      catalog_equipment_id: null,
      manufacturer: null,
      model_name: null,
      native_load_unit: 'kg',
      load_entry_semantics: 'machine_display',
      technical_metadata: { geometry: { lever: null }, source: 'user' },
      metadata_source: 'user_entered',
      created_at: '2026-10-09T08:00:00+00:00',
      ...changes,
    }),
  } as Response;
}
function configResponse(
  changes: Record<string, unknown> = {},
  status = 201,
): Response {
  return {
    status,
    json: async () => ({
      id: CONFIG,
      profile_id: PROFILE,
      label: 'Polea alta',
      material_setup: { cable: 'top', seat: 4 },
      metadata_source: 'user_entered',
      created_at: '2026-10-09T08:00:01+00:00',
      ...changes,
    }),
  } as Response;
}

describe('M3-MOB-006 owner-fenced machine CREATE HTTP dispatcher', () => {
  beforeEach(() => {
    jest.mocked(requestApi).mockReset();
    jest.mocked(requestApi).mockResolvedValue(profileResponse());
  });
  it('POSTs original profile bytes then dependent configuration; ACKs one at a time', async () => {
    const db = new FakeDB();
    expect(await syncNextPendingMachineCreate(db, auth().access)).toEqual({
      state: 'acknowledged',
      mutationId: PROFILE_MUTATION,
    });
    const [path, init] = jest.mocked(requestApi).mock.calls[0]!;
    expect(path).toBe('/machine-profiles');
    expect(init?.body).toEqual(db.rows.get(PROFILE_MUTATION)!.payload_json);
    expect(init?.headers).toEqual({
      Authorization: 'Bearer access-token',
      'Content-Type': 'application/json',
    });
    expect(db.state(CONFIG_MUTATION)).toBe('pending');
    expect(db.state('other-account')).toBe('pending');

    jest.mocked(requestApi).mockResolvedValue(configResponse());
    expect(await syncNextPendingMachineCreate(db, auth().access)).toEqual({
      state: 'acknowledged',
      mutationId: CONFIG_MUTATION,
    });
    expect(jest.mocked(requestApi).mock.calls[1]![0]).toBe(
      `/machine-profiles/${PROFILE}/configurations`,
    );
    expect(jest.mocked(requestApi).mock.calls[1]![1]?.body).toBe(
      db.rows.get(CONFIG_MUTATION)!.payload_json,
    );
    expect((await syncNextPendingMachineCreate(db, auth().access)).state).toBe(
      'idle',
    );
  });
  it('blocks unacknowledged or cross-account parent before HTTP', async () => {
    const db = new FakeDB();
    db.rows.get(PROFILE_MUTATION)!.delivery_state = 'conflict';
    expect(await syncNextPendingMachineCreate(db, auth().access)).toEqual({
      state: 'blocked',
      reason: 'dependency',
    });
    expect(requestApi).not.toHaveBeenCalled();
    db.rows.get(PROFILE_MUTATION)!.delivery_state = 'acknowledged';
    db.rows.get(PROFILE_MUTATION)!.subject = B;
    expect((await syncNextPendingMachineCreate(db, auth().access)).state).toBe(
      'blocked',
    );
    expect(requestApi).not.toHaveBeenCalled();
  });
  it('rejects mismatching immutable metadata, IDs and owner before HTTP', async () => {
    for (const corrupt of [
      (db: FakeDB) => {
        db.rows.get(PROFILE_MUTATION)!.profile_id = CONFIG;
      },
      (db: FakeDB) => {
        db.profiles.get(PROFILE)!.native_load_unit = 'lb';
      },
      (db: FakeDB) => {
        db.rows.get(PROFILE_MUTATION)!.payload_json = '{}';
      },
      (db: FakeDB) => {
        db.profiles.get(PROFILE)!.subject = B;
      },
    ]) {
      const db = new FakeDB();
      corrupt(db);
      expect(await syncNextPendingMachineCreate(db, auth().access)).toEqual({
        state: 'blocked',
        reason: 'localData',
      });
    }
    expect(requestApi).not.toHaveBeenCalled();
  });
  it.each([
    { id: CONFIG },
    { native_load_unit: 'lb' },
    { nickname: 'Polea B' },
    { metadata_source: 'verified' },
    { technical_metadata: { source: 'provider' } },
    { catalog_equipment_id: CONFIG },
    { created_at: 'invalid' },
  ])('never ACKs a mismatching profile receipt %j', async (change) => {
    const db = new FakeDB();
    jest.mocked(requestApi).mockResolvedValue(profileResponse(change));
    expect(await syncNextPendingMachineCreate(db, auth().access)).toEqual({
      state: 'retryable',
      reason: 'invalidResponse',
    });
    expect(db.state()).toBe('pending');
  });
  it.each([
    { id: PROFILE },
    { profile_id: CONFIG },
    { label: 'Wrong' },
    { material_setup: { cable: 'bottom' } },
    { metadata_source: null },
  ])('never ACKs a mismatching configuration receipt %j', async (change) => {
    const db = new FakeDB();
    db.rows.get(PROFILE_MUTATION)!.delivery_state = 'acknowledged';
    jest.mocked(requestApi).mockResolvedValue(configResponse(change));
    expect(await syncNextPendingMachineCreate(db, auth().access)).toEqual({
      state: 'retryable',
      reason: 'invalidResponse',
    });
    expect(db.state(CONFIG_MUTATION)).toBe('pending');
  });
  it.each([429, 500, 503])(
    'retries HTTP %s without consuming mutation',
    async (status) => {
      const db = new FakeDB();
      jest.mocked(requestApi).mockResolvedValue(profileResponse({}, status));
      expect(
        (await syncNextPendingMachineCreate(db, auth().access)).state,
      ).toBe('retryable');
      expect(db.state()).toBe('pending');
    },
  );
  it.each([401, 403])(
    'blocks on auth HTTP %s, keeping pending',
    async (status) => {
      const db = new FakeDB();
      jest.mocked(requestApi).mockResolvedValue(profileResponse({}, status));
      expect(await syncNextPendingMachineCreate(db, auth().access)).toEqual({
        state: 'blocked',
        reason: 'auth',
      });
      expect(db.state()).toBe('pending');
    },
  );
  it('marks conflict only for current subject; dependent config stays pending', async () => {
    const db = new FakeDB();
    jest.mocked(requestApi).mockResolvedValue(profileResponse({}, 409));
    expect(await syncNextPendingMachineCreate(db, auth().access)).toEqual({
      state: 'conflict',
      mutationId: PROFILE_MUTATION,
    });
    expect(db.state()).toBe('conflict');
    expect(db.state(CONFIG_MUTATION)).toBe('pending');
    expect(db.state('other-account')).toBe('pending');
  });
  it('replays original exact payload after lost network response and failed local ACK', async () => {
    const db = new FakeDB();
    jest.mocked(requestApi).mockRejectedValueOnce(new Error('offline'));
    expect((await syncNextPendingMachineCreate(db, auth().access)).state).toBe(
      'retryable',
    );
    db.failWrite = true;
    await expect(
      syncNextPendingMachineCreate(db, auth().access),
    ).rejects.toThrow('disk full');
    expect(db.state()).toBe('pending');
    await syncNextPendingMachineCreate(db, auth().access);
    expect(db.state()).toBe('acknowledged');
    expect(
      jest.mocked(requestApi).mock.calls.map((call) => call[1]?.body),
    ).toEqual([
      JSON.stringify(profileCommand),
      JSON.stringify(profileCommand),
      JSON.stringify(profileCommand),
    ]);
  });
  it('does not send with absent/wrong-account credentials', async () => {
    const account = auth();
    account.noToken();
    expect(
      await syncNextPendingMachineCreate(new FakeDB(), account.access),
    ).toEqual({
      state: 'blocked',
      reason: 'auth',
    });
    const other = auth();
    other.otherToken();
    expect(
      (await syncNextPendingMachineCreate(new FakeDB(), other.access)).state,
    ).toBe('blocked');
    expect(requestApi).not.toHaveBeenCalled();
  });
  it('does not ACK old subject after logout during HTTP', async () => {
    const db = new FakeDB(),
      account = auth();
    let finish: ((value: Response) => void) | undefined;
    jest.mocked(requestApi).mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const attempt = syncNextPendingMachineCreate(db, account.access);
    for (let i = 0; i < 15 && !finish; i++) await Promise.resolve();
    expect(finish).toBeDefined();
    account.change(null);
    finish!(profileResponse());
    await expect(attempt).rejects.toMatchObject({ code: 'notAuthenticated' });
    expect(db.state()).toBe('pending');
  });
  it('rolls back ACK on identity swap during write', async () => {
    const db = new FakeDB(),
      account = auth();
    db.onWrite = () => account.change(B);
    await expect(
      syncNextPendingMachineCreate(db, account.access),
    ).rejects.toMatchObject({
      code: 'notAuthenticated',
    });
    expect(db.state()).toBe('pending');
  });
  it('prevents duplicate concurrent HTTP on one local DB', async () => {
    const db = new FakeDB();
    let finish: ((value: Response) => void) | undefined;
    jest.mocked(requestApi).mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const first = syncNextPendingMachineCreate(db, auth().access);
    expect(await syncNextPendingMachineCreate(db, auth().access)).toEqual({
      state: 'inFlight',
    });
    for (let i = 0; i < 15 && !finish; i++) await Promise.resolve();
    finish!(profileResponse());
    await expect(first).resolves.toEqual({
      state: 'acknowledged',
      mutationId: PROFILE_MUTATION,
    });
    expect(requestApi).toHaveBeenCalledTimes(1);
  });
});
