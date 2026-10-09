/**
 * M3-MOB-006: manual, owner-fenced transport for offline machine CREATEs.
 *
 * One call attempts at most one immutable mutation. Profiles are delivered
 * before configurations; neither a server response nor an HTTP 201 alone is
 * an ACK without a matching authoritative receipt and committed local update.
 * Not wired to any UI or background worker.
 */
import { requestApi } from '../api/client';
import {
  LocalMachineError,
  type LocalMachineConfiguration,
  type LocalMachineProfile,
} from './local-machine-store';
import type { SqliteWorkoutPort } from './local-schema';
import type { LocalSubjectAccess } from './local-store';
import type { StartSyncAccess } from './start-session-sync';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMEOUT_MS = 15_000;
const PROFILE = 'CREATE_MACHINE_PROFILE';
const CONFIG = 'CREATE_MACHINE_CONFIGURATION';
const inFlight = new WeakSet<SqliteWorkoutPort>();

type MachineRow = {
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
type Command = Record<string, unknown>;
type LocalMachine = LocalMachineProfile | LocalMachineConfiguration;
export type MachineCreateSyncOutcome =
  | { state: 'idle' | 'inFlight' }
  | { state: 'acknowledged' | 'conflict'; mutationId: string }
  | {
      state: 'blocked';
      reason: 'auth' | 'dependency' | 'localData' | 'rejected';
    }
  | { state: 'retryable'; reason: 'network' | 'server' | 'invalidResponse' };

function currentSubject(access: LocalSubjectAccess): string {
  const subject = access.currentAuthenticatedSubject();
  if (!subject || !UUID.test(subject))
    throw new LocalMachineError('notAuthenticated');
  return subject.toLowerCase();
}
function guard(access: LocalSubjectAccess, expected: string): void {
  if (currentSubject(access) !== expected)
    throw new LocalMachineError('notAuthenticated');
}
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b, 'en'))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}
function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}
function parseObject(json: string): Record<string, unknown> | null {
  try {
    return object(JSON.parse(json));
  } catch {
    return null;
  }
}
function sameUuid(left: unknown, right: string): boolean {
  return (
    typeof left === 'string' && UUID.test(left) && left.toLowerCase() === right
  );
}

function readImmutableCommand(
  row: MachineRow,
  entity: LocalMachine,
): Command | null {
  if (
    row.protocol_version !== 1 ||
    row.delivery_state !== 'pending' ||
    !UUID.test(row.subject) ||
    !UUID.test(row.mutation_id) ||
    !UUID.test(row.profile_id) ||
    !UUID.test(row.entity_id) ||
    entity.subject !== row.subject ||
    entity.create_mutation_id !== row.mutation_id ||
    entity.created_at_utc !== row.created_at_utc
  )
    return null;
  let expected: Command;
  if (row.mutation_kind === PROFILE && 'nickname' in entity) {
    if (
      row.entity_id !== row.profile_id ||
      entity.profile_id !== row.profile_id ||
      row.depends_on_mutation_id !== null
    )
      return null;
    const technical = parseObject(entity.technical_metadata_json);
    if (!technical) return null;
    expected = {
      protocol_version: 1,
      kind: PROFILE,
      mutation_id: row.mutation_id,
      profile_id: row.profile_id,
      nickname: entity.nickname,
      catalog_equipment_id: entity.catalog_equipment_id,
      manufacturer: entity.manufacturer,
      model_name: entity.model_name,
      native_load_unit: entity.native_load_unit,
      load_entry_semantics: entity.load_entry_semantics,
      technical_metadata: technical,
      metadata_source: 'user_entered',
    };
  } else if (row.mutation_kind === CONFIG && 'label' in entity) {
    if (
      entity.configuration_id !== row.entity_id ||
      entity.profile_id !== row.profile_id ||
      !row.depends_on_mutation_id ||
      !UUID.test(row.depends_on_mutation_id)
    )
      return null;
    const setup = parseObject(entity.material_setup_json);
    if (!setup) return null;
    expected = {
      protocol_version: 1,
      kind: CONFIG,
      mutation_id: row.mutation_id,
      configuration_id: row.entity_id,
      profile_id: row.profile_id,
      label: entity.label,
      material_setup: setup,
      metadata_source: 'user_entered',
    };
  } else return null;
  const command = parseObject(row.payload_json);
  return command && sameJson(command, expected) ? command : null;
}

function matchingReceipt(
  body: unknown,
  row: MachineRow,
  entity: LocalMachine,
  command: Command,
): boolean {
  const receipt = object(body);
  if (
    !receipt ||
    !sameUuid(receipt.id, row.entity_id) ||
    typeof receipt.created_at !== 'string' ||
    !Number.isFinite(Date.parse(receipt.created_at)) ||
    receipt.metadata_source !== 'user_entered'
  )
    return false;
  if (row.mutation_kind === PROFILE && 'nickname' in entity) {
    return (
      receipt.nickname === entity.nickname &&
      receipt.catalog_equipment_id === entity.catalog_equipment_id &&
      receipt.manufacturer === entity.manufacturer &&
      receipt.model_name === entity.model_name &&
      receipt.native_load_unit === entity.native_load_unit &&
      receipt.load_entry_semantics === entity.load_entry_semantics &&
      sameJson(receipt.technical_metadata, command.technical_metadata)
    );
  }
  if (row.mutation_kind === CONFIG && 'label' in entity) {
    return (
      sameUuid(receipt.profile_id, row.profile_id) &&
      receipt.label === entity.label &&
      sameJson(receipt.material_setup, command.material_setup)
    );
  }
  return false;
}

async function pendingRow(
  db: SqliteWorkoutPort,
  subject: string,
): Promise<MachineRow | null> {
  // Prioritize independent profile CREATEs to unblock configuration children,
  // even if a client-supplied configuration timestamp sorts earlier.
  const profile = await db.getFirstAsync<MachineRow>(
    "SELECT * FROM local_machine_outbox WHERE subject = ? AND mutation_kind = 'CREATE_MACHINE_PROFILE' AND delivery_state = 'pending' ORDER BY created_at_utc, mutation_id LIMIT 1",
    subject,
  );
  return (
    profile ??
    db.getFirstAsync<MachineRow>(
      "SELECT * FROM local_machine_outbox WHERE subject = ? AND mutation_kind = 'CREATE_MACHINE_CONFIGURATION' AND delivery_state = 'pending' ORDER BY created_at_utc, mutation_id LIMIT 1",
      subject,
    )
  );
}
async function localEntity(
  db: SqliteWorkoutPort,
  row: MachineRow,
): Promise<LocalMachine | null> {
  if (row.mutation_kind === PROFILE) {
    return db.getFirstAsync<LocalMachineProfile>(
      'SELECT * FROM local_machine_profiles WHERE subject = ? AND profile_id = ?',
      row.subject,
      row.profile_id,
    );
  }
  if (row.mutation_kind === CONFIG) {
    return db.getFirstAsync<LocalMachineConfiguration>(
      'SELECT * FROM local_machine_configurations WHERE subject = ? AND configuration_id = ?',
      row.subject,
      row.entity_id,
    );
  }
  return null;
}
async function validParent(
  db: SqliteWorkoutPort,
  row: MachineRow,
): Promise<boolean> {
  if (row.mutation_kind === PROFILE) return true;
  if (!row.depends_on_mutation_id) return false;
  const parent = await db.getFirstAsync<MachineRow>(
    'SELECT * FROM local_machine_outbox WHERE subject = ? AND mutation_id = ?',
    row.subject,
    row.depends_on_mutation_id,
  );
  return Boolean(
    parent &&
    parent.subject === row.subject &&
    parent.mutation_kind === PROFILE &&
    parent.delivery_state === 'acknowledged' &&
    parent.entity_id === row.profile_id &&
    parent.profile_id === row.profile_id &&
    parent.depends_on_mutation_id === null,
  );
}

async function send(
  row: MachineRow,
  token: string,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const route =
    row.mutation_kind === PROFILE
      ? '/machine-profiles'
      : `/machine-profiles/${row.profile_id}/configurations`;
  try {
    const response = await requestApi(route, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: row.payload_json,
      signal: controller.signal,
    });
    if (response.status !== 201) return { status: response.status, body: null };
    try {
      return { status: 201, body: await response.json() };
    } catch {
      return { status: 201, body: null };
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function transition(
  db: SqliteWorkoutPort,
  access: LocalSubjectAccess,
  row: MachineRow,
  state: 'acknowledged' | 'conflict',
): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    guard(access, row.subject);
    const fresh = await tx.getFirstAsync<MachineRow>(
      'SELECT * FROM local_machine_outbox WHERE subject = ? AND mutation_id = ?',
      row.subject,
      row.mutation_id,
    );
    guard(access, row.subject);
    if (!fresh || !sameJson(fresh, row) || fresh.delivery_state !== 'pending')
      throw new LocalMachineError('corruptLocalData');
    const entity = await localEntity(tx as SqliteWorkoutPort, row);
    guard(access, row.subject);
    if (
      !entity ||
      !readImmutableCommand(row, entity) ||
      !(await validParent(tx as SqliteWorkoutPort, row))
    ) {
      throw new LocalMachineError('corruptLocalData');
    }
    guard(access, row.subject);
    await tx.runAsync(
      "UPDATE local_machine_outbox SET delivery_state = ? WHERE subject = ? AND mutation_id = ? AND delivery_state = 'pending'",
      state,
      row.subject,
      row.mutation_id,
    );
    guard(access, row.subject);
    const checked = await tx.getFirstAsync<MachineRow>(
      'SELECT * FROM local_machine_outbox WHERE subject = ? AND mutation_id = ?',
      row.subject,
      row.mutation_id,
    );
    guard(access, row.subject);
    if (
      !checked ||
      checked.delivery_state !== state ||
      !sameJson({ ...checked, delivery_state: 'pending' }, row)
    ) {
      throw new LocalMachineError('corruptLocalData');
    }
  });
  guard(access, row.subject);
}

/** A manual one-mutation boundary; never runs from screens or background jobs. */
export async function syncNextPendingMachineCreate(
  db: SqliteWorkoutPort,
  access: StartSyncAccess,
): Promise<MachineCreateSyncOutcome> {
  if (inFlight.has(db)) return { state: 'inFlight' };
  inFlight.add(db);
  try {
    const subject = currentSubject(access);
    const row = await pendingRow(db, subject);
    guard(access, subject);
    if (!row) return { state: 'idle' };
    if (
      row.subject !== subject ||
      row.delivery_state !== 'pending' ||
      ![PROFILE, CONFIG].includes(row.mutation_kind)
    ) {
      return { state: 'blocked', reason: 'localData' };
    }
    const entity = await localEntity(db, row);
    guard(access, subject);
    const command = entity && readImmutableCommand(row, entity);
    if (!entity || !command) return { state: 'blocked', reason: 'localData' };
    const parentReady = await validParent(db, row);
    guard(access, subject);
    if (!parentReady) return { state: 'blocked', reason: 'dependency' };
    const credentials = await access.acquireCurrentCredentials();
    guard(access, subject);
    if (
      !credentials ||
      !UUID.test(credentials.subject) ||
      credentials.subject.toLowerCase() !== subject ||
      !credentials.accessToken
    )
      return { state: 'blocked', reason: 'auth' };
    let response: { status: number; body: unknown };
    try {
      guard(access, subject);
      response = await send(row, credentials.accessToken);
    } catch (error) {
      guard(access, subject);
      void error;
      return { state: 'retryable', reason: 'network' };
    }
    guard(access, subject);
    if (response.status === 409) {
      await transition(db, access, row, 'conflict');
      return { state: 'conflict', mutationId: row.mutation_id };
    }
    if (response.status === 401 || response.status === 403)
      return { state: 'blocked', reason: 'auth' };
    if (response.status === 429 || response.status >= 500)
      return { state: 'retryable', reason: 'server' };
    if (response.status === 404 && row.mutation_kind === CONFIG)
      return { state: 'blocked', reason: 'dependency' };
    if (response.status !== 201)
      return { state: 'blocked', reason: 'rejected' };
    if (!matchingReceipt(response.body, row, entity, command))
      return { state: 'retryable', reason: 'invalidResponse' };
    await transition(db, access, row, 'acknowledged');
    return { state: 'acknowledged', mutationId: row.mutation_id };
  } finally {
    inFlight.delete(db);
  }
}
