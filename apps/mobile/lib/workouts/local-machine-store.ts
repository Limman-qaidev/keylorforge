/**
 * Offline, owner-partitioned Machine Profile and Configuration creates.
 *
 * The machine's immutable CREATE mutation and the human-readable local entity
 * are inserted in one exclusive SQLite transaction. No workout session, network
 * request, server ACK or inferred resistance equivalence is required.
 */
import type { SqliteWorkoutPort } from './local-schema';
import type { LocalSubjectAccess } from './local-store';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Unit = 'kg' | 'lb';
type LoadSemantics =
  'total' | 'per_implement' | 'machine_display' | 'assistance';

export class LocalMachineError extends Error {
  constructor(
    public readonly code:
      | 'notAuthenticated'
      | 'invalidInput'
      | 'mutationConflict'
      | 'machineIdConflict'
      | 'configurationIdConflict'
      | 'profileMissing'
      | 'corruptLocalData',
  ) {
    super(code);
    this.name = 'LocalMachineError';
  }
}

export type CreateLocalMachineProfileInput = {
  profileId: string;
  mutationId: string;
  nickname: string;
  catalogEquipmentId?: string | null;
  manufacturer?: string | null;
  modelName?: string | null;
  nativeLoadUnit?: Unit | null;
  loadEntrySemantics?: LoadSemantics | null;
  technicalMetadata?: Record<string, unknown>;
  createdAtUtc: string;
};

export type CreateLocalMachineConfigurationInput = {
  configurationId: string;
  mutationId: string;
  profileId: string;
  label: string;
  materialSetup: Record<string, unknown>;
  createdAtUtc: string;
};

export type LocalMachineProfile = {
  subject: string;
  profile_id: string;
  nickname: string;
  catalog_equipment_id: string | null;
  manufacturer: string | null;
  model_name: string | null;
  native_load_unit: Unit | null;
  load_entry_semantics: LoadSemantics | null;
  technical_metadata_json: string;
  metadata_source: 'user_entered';
  created_at_utc: string;
  create_mutation_id: string;
};

export type LocalMachineConfiguration = {
  subject: string;
  configuration_id: string;
  profile_id: string;
  label: string;
  material_setup_json: string;
  metadata_source: 'user_entered';
  created_at_utc: string;
  create_mutation_id: string;
};

type MachineOutboxRow = {
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

function activeSubject(access: LocalSubjectAccess): string {
  const value = access.currentAuthenticatedSubject();
  if (!value || !UUID.test(value))
    throw new LocalMachineError('notAuthenticated');
  return value.toLowerCase();
}

function guard(access: LocalSubjectAccess, subject: string): void {
  if (activeSubject(access) !== subject) {
    throw new LocalMachineError('notAuthenticated');
  }
}

function validInstant(value: string): boolean {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, 'en'))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function immutableJson(value: unknown): string {
  const serialized = JSON.stringify(canonicalize(value));
  if (!serialized) throw new LocalMachineError('invalidInput');
  return serialized;
}

function safeRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new LocalMachineError('invalidInput');
  }
  return value as Record<string, unknown>;
}

function frozenRecord(value: Record<string, unknown>): Record<string, unknown> {
  try {
    return safeRecord(JSON.parse(immutableJson(value)));
  } catch {
    throw new LocalMachineError('invalidInput');
  }
}

function name(value: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 120) {
    throw new LocalMachineError('invalidInput');
  }
  return value.trim();
}

function optionalText(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > 120) {
    throw new LocalMachineError('invalidInput');
  }
  return value.trim() || null;
}

function uuid(value: string): string {
  if (!UUID.test(value)) throw new LocalMachineError('invalidInput');
  return value.toLowerCase();
}

function validateUnit(value: unknown): Unit | null {
  if (value == null) return null;
  if (value !== 'kg' && value !== 'lb') {
    throw new LocalMachineError('invalidInput');
  }
  return value;
}

function validateSemantics(value: unknown): LoadSemantics | null {
  if (value == null) return null;
  if (
    value !== 'total' &&
    value !== 'per_implement' &&
    value !== 'machine_display' &&
    value !== 'assistance'
  )
    throw new LocalMachineError('invalidInput');
  return value;
}

function checkOutboxReplay(
  existing: MachineOutboxRow,
  expected: {
    subject: string;
    mutationId: string;
    entityId: string;
    profileId: string;
    kind: string;
    payload: string;
    dependsOn: string | null;
  },
): void {
  let prior: string;
  try {
    prior = immutableJson(JSON.parse(existing.payload_json));
  } catch {
    throw new LocalMachineError('corruptLocalData');
  }
  if (
    existing.subject !== expected.subject ||
    existing.mutation_id !== expected.mutationId ||
    existing.entity_id !== expected.entityId ||
    existing.profile_id !== expected.profileId ||
    existing.mutation_kind !== expected.kind ||
    existing.protocol_version !== 1 ||
    existing.depends_on_mutation_id !== expected.dependsOn ||
    prior !== expected.payload
  ) {
    throw new LocalMachineError('mutationConflict');
  }
}

/** Persist profile + immutable CREATE_MACHINE_PROFILE outbox atomically. */
export async function createLocalMachineProfile(
  db: SqliteWorkoutPort,
  access: LocalSubjectAccess,
  raw: CreateLocalMachineProfileInput,
): Promise<LocalMachineProfile> {
  const subject = activeSubject(access);
  if (!validInstant(raw.createdAtUtc))
    throw new LocalMachineError('invalidInput');
  const profileId = uuid(raw.profileId);
  const mutationId = uuid(raw.mutationId);
  const nickname = name(raw.nickname);
  const metadata = frozenRecord(raw.technicalMetadata ?? {});
  const catalogEquipmentId =
    raw.catalogEquipmentId == null ? null : uuid(raw.catalogEquipmentId);
  const manufacturer = optionalText(raw.manufacturer);
  const modelName = optionalText(raw.modelName);
  const nativeLoadUnit = validateUnit(raw.nativeLoadUnit);
  const loadEntrySemantics = validateSemantics(raw.loadEntrySemantics);
  const payload = immutableJson({
    protocol_version: 1,
    kind: 'CREATE_MACHINE_PROFILE',
    mutation_id: mutationId,
    profile_id: profileId,
    nickname,
    catalog_equipment_id: catalogEquipmentId,
    manufacturer,
    model_name: modelName,
    native_load_unit: nativeLoadUnit,
    load_entry_semantics: loadEntrySemantics,
    technical_metadata: metadata,
    metadata_source: 'user_entered',
  });
  let created: LocalMachineProfile | null = null;

  await db.withExclusiveTransactionAsync(async (tx) => {
    guard(access, subject);
    const duplicate = await tx.getFirstAsync<MachineOutboxRow>(
      'SELECT * FROM local_machine_outbox WHERE subject = ? AND mutation_id = ?',
      subject,
      mutationId,
    );
    guard(access, subject);
    if (duplicate) {
      checkOutboxReplay(duplicate, {
        subject,
        mutationId,
        entityId: profileId,
        profileId,
        kind: 'CREATE_MACHINE_PROFILE',
        payload,
        dependsOn: null,
      });
      created = await tx.getFirstAsync<LocalMachineProfile>(
        'SELECT * FROM local_machine_profiles WHERE subject = ? AND profile_id = ?',
        subject,
        profileId,
      );
      guard(access, subject);
      if (!created || created.create_mutation_id !== mutationId) {
        throw new LocalMachineError('corruptLocalData');
      }
      return;
    }

    const prior = await tx.getFirstAsync<LocalMachineProfile>(
      'SELECT * FROM local_machine_profiles WHERE profile_id = ?',
      profileId,
    );
    guard(access, subject);
    if (prior) throw new LocalMachineError('machineIdConflict');

    await tx.runAsync(
      `INSERT INTO local_machine_outbox
        (subject, mutation_id, mutation_kind, profile_id, entity_id,
         protocol_version, payload_json, created_at_utc)
       VALUES (?, ?, 'CREATE_MACHINE_PROFILE', ?, ?, 1, ?, ?)`,
      subject,
      mutationId,
      profileId,
      profileId,
      payload,
      raw.createdAtUtc,
    );
    guard(access, subject);
    await tx.runAsync(
      `INSERT INTO local_machine_profiles
        (subject, profile_id, nickname, catalog_equipment_id, manufacturer,
         model_name, native_load_unit, load_entry_semantics,
         technical_metadata_json, metadata_source, created_at_utc,
         create_mutation_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'user_entered', ?, ?)`,
      subject,
      profileId,
      nickname,
      catalogEquipmentId,
      manufacturer,
      modelName,
      nativeLoadUnit,
      loadEntrySemantics,
      immutableJson(metadata),
      raw.createdAtUtc,
      mutationId,
    );
    guard(access, subject);
    created = await tx.getFirstAsync<LocalMachineProfile>(
      'SELECT * FROM local_machine_profiles WHERE subject = ? AND profile_id = ?',
      subject,
      profileId,
    );
    guard(access, subject);
    if (!created) throw new LocalMachineError('corruptLocalData');
  });
  guard(access, subject);
  if (!created) throw new LocalMachineError('corruptLocalData');
  return created;
}

/** Profile dependency uses its original create mutation, never mere UUID existence. */
export async function createLocalMachineConfiguration(
  db: SqliteWorkoutPort,
  access: LocalSubjectAccess,
  raw: CreateLocalMachineConfigurationInput,
): Promise<LocalMachineConfiguration> {
  const subject = activeSubject(access);
  if (!validInstant(raw.createdAtUtc))
    throw new LocalMachineError('invalidInput');
  const configurationId = uuid(raw.configurationId);
  const mutationId = uuid(raw.mutationId);
  const profileId = uuid(raw.profileId);
  const label = name(raw.label);
  const setup = frozenRecord(raw.materialSetup);
  const payload = immutableJson({
    protocol_version: 1,
    kind: 'CREATE_MACHINE_CONFIGURATION',
    mutation_id: mutationId,
    configuration_id: configurationId,
    profile_id: profileId,
    label,
    material_setup: setup,
    metadata_source: 'user_entered',
  });
  let created: LocalMachineConfiguration | null = null;

  await db.withExclusiveTransactionAsync(async (tx) => {
    guard(access, subject);
    const profile = await tx.getFirstAsync<LocalMachineProfile>(
      'SELECT * FROM local_machine_profiles WHERE subject = ? AND profile_id = ?',
      subject,
      profileId,
    );
    guard(access, subject);
    if (!profile) throw new LocalMachineError('profileMissing');
    const predecessor = await tx.getFirstAsync<MachineOutboxRow>(
      'SELECT * FROM local_machine_outbox WHERE subject = ? AND mutation_id = ?',
      subject,
      profile.create_mutation_id,
    );
    guard(access, subject);
    if (
      !predecessor ||
      predecessor.mutation_kind !== 'CREATE_MACHINE_PROFILE' ||
      predecessor.profile_id !== profileId ||
      predecessor.entity_id !== profileId
    ) {
      throw new LocalMachineError('corruptLocalData');
    }

    const duplicate = await tx.getFirstAsync<MachineOutboxRow>(
      'SELECT * FROM local_machine_outbox WHERE subject = ? AND mutation_id = ?',
      subject,
      mutationId,
    );
    guard(access, subject);
    if (duplicate) {
      checkOutboxReplay(duplicate, {
        subject,
        mutationId,
        entityId: configurationId,
        profileId,
        kind: 'CREATE_MACHINE_CONFIGURATION',
        payload,
        dependsOn: profile.create_mutation_id,
      });
      created = await tx.getFirstAsync<LocalMachineConfiguration>(
        'SELECT * FROM local_machine_configurations WHERE subject = ? AND configuration_id = ?',
        subject,
        configurationId,
      );
      guard(access, subject);
      if (!created || created.create_mutation_id !== mutationId) {
        throw new LocalMachineError('corruptLocalData');
      }
      return;
    }

    const prior = await tx.getFirstAsync<LocalMachineConfiguration>(
      'SELECT * FROM local_machine_configurations WHERE configuration_id = ?',
      configurationId,
    );
    guard(access, subject);
    if (prior) throw new LocalMachineError('configurationIdConflict');

    await tx.runAsync(
      `INSERT INTO local_machine_outbox
        (subject, mutation_id, mutation_kind, profile_id, entity_id,
         protocol_version, payload_json, created_at_utc, depends_on_mutation_id)
       VALUES (?, ?, 'CREATE_MACHINE_CONFIGURATION', ?, ?, 1, ?, ?, ?)`,
      subject,
      mutationId,
      profileId,
      configurationId,
      payload,
      raw.createdAtUtc,
      profile.create_mutation_id,
    );
    guard(access, subject);
    await tx.runAsync(
      `INSERT INTO local_machine_configurations
        (subject, configuration_id, profile_id, label, material_setup_json,
         metadata_source, created_at_utc, create_mutation_id)
       VALUES (?, ?, ?, ?, ?, 'user_entered', ?, ?)`,
      subject,
      configurationId,
      profileId,
      label,
      immutableJson(setup),
      raw.createdAtUtc,
      mutationId,
    );
    guard(access, subject);
    created = await tx.getFirstAsync<LocalMachineConfiguration>(
      'SELECT * FROM local_machine_configurations WHERE subject = ? AND configuration_id = ?',
      subject,
      configurationId,
    );
    guard(access, subject);
    if (!created) throw new LocalMachineError('corruptLocalData');
  });
  guard(access, subject);
  if (!created) throw new LocalMachineError('corruptLocalData');
  return created;
}
