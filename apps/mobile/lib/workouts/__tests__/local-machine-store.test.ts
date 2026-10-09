import {
  createLocalMachineProfile,
  createLocalMachineConfiguration,
  type LocalMachineProfile,
  type LocalMachineConfiguration,
} from '../local-machine-store';
import type { SqliteQueryPort, SqliteWorkoutPort } from '../local-schema';
import type { LocalSubjectAccess } from '../local-store';

const A = 'a3dbf764-e0e3-41aa-9895-6e58eadfbb14';
const B = 'e426dd13-344a-4b69-8920-cb014715c6c1';
const PROFILE = '2d2bd42f-bebf-45d3-81b1-a89b8830872b';
const MUTATION = '0d72c629-6248-4221-8ab2-d9b9f1b63901';
const CONFIG = 'e6abfa2f-a26e-4202-a53f-56595568f189';
const CONFIG_MUTATION = 'fb3ee135-4e5f-4c9e-bd5d-2b162ad6c95d';
const DATE = '2026-10-09T08:00:00.000Z';

const profile = {
  profileId: PROFILE,
  mutationId: MUTATION,
  nickname: 'Polea A',
  nativeLoadUnit: 'kg' as const,
  loadEntrySemantics: 'machine_display' as const,
  technicalMetadata: { source: 'user', geometry: { lever: null } },
  createdAtUtc: DATE,
};
const config = {
  configurationId: CONFIG,
  mutationId: CONFIG_MUTATION,
  profileId: PROFILE,
  label: 'Polea alta',
  materialSetup: { seat: 4, cable: 'top' },
  createdAtUtc: DATE,
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
  depends_on_mutation_id: string | null;
};
class FakeMachines implements SqliteWorkoutPort {
  outbox = new Map<string, Outbox>();
  profiles = new Map<string, LocalMachineProfile>();
  configurations = new Map<string, LocalMachineConfiguration>();
  failProfile = false;
  onWrite?: () => void;
  async execAsync(): Promise<void> {}
  async getFirstAsync<T>(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<T | null> {
    let result: unknown = null;
    if (sql.includes('FROM local_machine_outbox')) {
      result = this.outbox.get(String(params[0]) + ':' + String(params[1]));
    } else if (sql.includes('FROM local_machine_profiles')) {
      result = params.length === 2
        ? this.profiles.get(String(params[1]))
        : this.profiles.get(String(params[0]));
      if (params.length === 2 && (result as LocalMachineProfile | undefined)?.subject !== params[0]) {
        result = null;
      }
    } else if (sql.includes('FROM local_machine_configurations')) {
      result = this.configurations.get(String(params[params.length - 1]));
      if (params.length === 2 && (result as LocalMachineConfiguration | undefined)?.subject !== params[0]) {
        result = null;
      }
    } else {
      throw new Error('Unexpected query ' + sql);
    }
    return (result ?? null) as T | null;
  }
  async runAsync(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<unknown> {
    if (sql.includes('INSERT INTO local_machine_outbox')) {
      const [subject, mutation, profileId, entityId, payload, createdAt, parent] = params;
      this.outbox.set(String(subject) + ':' + String(mutation), {
        subject: String(subject),
        mutation_id: String(mutation),
        mutation_kind: sql.includes('CREATE_MACHINE_CONFIGURATION')
          ? 'CREATE_MACHINE_CONFIGURATION' : 'CREATE_MACHINE_PROFILE',
        profile_id: String(profileId),
        entity_id: String(entityId),
        payload_json: String(payload),
        protocol_version: 1,
        delivery_state: 'pending',
        depends_on_mutation_id: parent ? String(parent) : null,
      });
      void createdAt;
    } else if (sql.includes('INSERT INTO local_machine_profiles')) {
      if (this.failProfile) throw new Error('SQLite disk full');
      const [subject, id, nickname, catalog, manufacturer, model, unit,
        semantics, metadata, created, mutation] = params;
      this.profiles.set(String(id), {
        subject: String(subject),
        profile_id: String(id),
        nickname: String(nickname),
        catalog_equipment_id: catalog as string | null,
        manufacturer: manufacturer as string | null,
        model_name: model as string | null,
        native_load_unit: unit as 'kg' | 'lb' | null,
        load_entry_semantics: semantics as LocalMachineProfile['load_entry_semantics'],
        technical_metadata_json: String(metadata),
        metadata_source: 'user_entered',
        created_at_utc: String(created),
        create_mutation_id: String(mutation),
      });
    } else if (sql.includes('INSERT INTO local_machine_configurations')) {
      const [subject, id, profileId, label, setup, created, mutation] = params;
      this.configurations.set(String(id), {
        subject: String(subject),
        configuration_id: String(id),
        profile_id: String(profileId),
        label: String(label),
        material_setup_json: String(setup),
        metadata_source: 'user_entered',
        created_at_utc: String(created),
        create_mutation_id: String(mutation),
      });
    } else {
      throw new Error('Unexpected insert ' + sql);
    }
    this.onWrite?.();
    return undefined;
  }
  async withExclusiveTransactionAsync(
    task: (tx: SqliteQueryPort) => Promise<void>,
  ): Promise<void> {
    const prior = {
      outbox: new Map(this.outbox),
      profiles: new Map(this.profiles),
      configurations: new Map(this.configurations),
    };
    try {
      await task(this);
    } catch (error) {
      this.outbox = prior.outbox;
      this.profiles = prior.profiles;
      this.configurations = prior.configurations;
      throw error;
    }
  }
}

function auth() {
  let subject: string | null = A;
  const access: LocalSubjectAccess = {
    currentAuthenticatedSubject: () => subject,
  };
  return {
    access,
    switchTo: (value: string | null) => { subject = value; },
  };
}

describe('M3 offline Machine Profile and Configuration atomic CREATE', () => {
  it('creates a machine without any workout and an immutable owner-scoped outbox row', async () => {
    const db = new FakeMachines();
    const row = await createLocalMachineProfile(db, auth().access, profile);
    expect(row.nickname).toBe('Polea A');
    expect(row.native_load_unit).toBe('kg');
    expect(row.load_entry_semantics).toBe('machine_display');
    expect(db.outbox.get(A + ':' + MUTATION)?.mutation_kind).toBe('CREATE_MACHINE_PROFILE');
    expect(db.outbox.get(A + ':' + MUTATION)?.delivery_state).toBe('pending');
    const body = JSON.parse(db.outbox.get(A + ':' + MUTATION)!.payload_json);
    expect(body.technical_metadata.geometry.lever).toBeNull();
    expect(body.metadata_source).toBe('user_entered');
  });

  it('retries identical semantic payload with reordered nested keys without duplicates', async () => {
    const db = new FakeMachines();
    await createLocalMachineProfile(db, auth().access, profile);
    expect(await createLocalMachineProfile(db, auth().access, {
      ...profile,
      technicalMetadata: { geometry: { lever: null }, source: 'user' },
    })).toMatchObject({ profile_id: PROFILE, create_mutation_id: MUTATION });
    expect(db.outbox.size).toBe(1);
    expect(db.profiles.size).toBe(1);
    await expect(createLocalMachineProfile(db, auth().access, {
      ...profile, nickname: 'Polea B',
    })).rejects.toMatchObject({ code: 'mutationConflict' });
    expect(db.profiles.get(PROFILE)?.nickname).toBe('Polea A');
  });

  it('requires the same-subject parent create mutation for configuration', async () => {
    const db = new FakeMachines();
    await expect(createLocalMachineConfiguration(db, auth().access, config))
      .rejects.toMatchObject({ code: 'profileMissing' });
    await createLocalMachineProfile(db, auth().access, profile);
    const result = await createLocalMachineConfiguration(db, auth().access, config);
    expect(result.profile_id).toBe(PROFILE);
    expect(db.outbox.get(A + ':' + CONFIG_MUTATION)?.depends_on_mutation_id).toBe(MUTATION);
    expect(db.outbox.get(A + ':' + CONFIG_MUTATION)?.delivery_state).toBe('pending');
    expect(await createLocalMachineConfiguration(db, auth().access, config))
      .toMatchObject({ configuration_id: CONFIG });
    expect(db.configurations.size).toBe(1);
    await expect(createLocalMachineConfiguration(db, auth().access, {
      ...config, materialSetup: { seat: 5, cable: 'top' },
    })).rejects.toMatchObject({ code: 'mutationConflict' });
  });

  it('does not allow another account to create a configuration for this profile', async () => {
    const db = new FakeMachines();
    await createLocalMachineProfile(db, auth().access, profile);
    const ownerB = auth();
    ownerB.switchTo(B);
    await expect(createLocalMachineConfiguration(db, ownerB.access, config))
      .rejects.toMatchObject({ code: 'profileMissing' });
    expect(db.outbox.size).toBe(1);
  });

  it('rolls back outbox and profile as one transaction on disk failure', async () => {
    const db = new FakeMachines();
    db.failProfile = true;
    await expect(createLocalMachineProfile(db, auth().access, profile))
      .rejects.toThrow('SQLite disk full');
    expect(db.outbox.size).toBe(0);
    expect(db.profiles.size).toBe(0);
  });

  it('rolls back profile and outbox if sign-out occurs during writes', async () => {
    const db = new FakeMachines();
    const identity = auth();
    db.onWrite = () => identity.switchTo(null);
    await expect(createLocalMachineProfile(db, identity.access, profile))
      .rejects.toMatchObject({ code: 'notAuthenticated' });
    expect(db.outbox.size).toBe(0);
    expect(db.profiles.size).toBe(0);
  });

  it('rejects malformed identifiers, invalid units and non-JSON-safe data', async () => {
    const db = new FakeMachines();
    const tests = [
      { ...profile, profileId: 'no' },
      { ...profile, nativeLoadUnit: 'stones' as 'kg' },
      { ...profile, createdAtUtc: 'bad' },
      { ...profile, nickname: '   ' },
    ];
    for (const input of tests) {
      await expect(createLocalMachineProfile(db, auth().access, input))
        .rejects.toMatchObject({ code: 'invalidInput' });
    }
    expect(db.outbox.size).toBe(0);
  });
});
