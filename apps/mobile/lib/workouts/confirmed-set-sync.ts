/**
 * M3 v2 causal confirmed-set outbox dispatcher.
 *
 * A call handles at most one pending mutation; no background scheduling or
 * production-screen integration. Machine creates must already be acknowledged;
 * applied agenda / target syncing remains deliberately unsupported.
 * An acknowledged predecessor is required before network I/O, and a committed
 * matching server receipt is required before atomically recording SQLite ACK.
 */
import { requestApi } from '../api/client';
import type { SqliteWorkoutPort } from './local-schema';
import { LocalWorkoutError, type LocalSubjectAccess } from './local-store';
import type { StartSyncAccess } from './start-session-sync';
import type { LocalPerformedSet } from './local-confirmed-sets';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL = /^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,3})?$/;
const TIMEOUT_MS = 15_000;
const KIND_FIRST = 'CONFIRM_FIRST_SET_WITH_OCCURRENCE';
const KIND_ADDITIONAL = 'CONFIRM_ADDITIONAL_SET';
const inFlight = new WeakSet<SqliteWorkoutPort>();

type PendingSet = {
  subject: string;
  mutation_id: string;
  session_id: string;
  mutation_kind: string;
  payload_json: string;
  protocol_version: number;
  delivery_state: string;
  depends_on_mutation_id: string | null;
};
type ParentState = {
  mutation_id: string;
  session_id: string;
  delivery_state: string;
};
type Occurrence = {
  canonical_exercise_id: string;
  agenda_item_id: string | null;
  first_set_id: string;
  actual_order: number;
};
type MachineProfileRow = {
  subject: string;
  profile_id: string;
  create_mutation_id: string;
  native_load_unit: string | null;
  load_entry_semantics: string | null;
};
type MachineConfigurationRow = {
  subject: string;
  profile_id: string;
  configuration_id: string;
  create_mutation_id: string;
};
type MachineCreateRow = {
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
type Command = {
  protocol_version: number;
  kind: string;
  session_id: string;
  mutation_id: string;
  set_id: string;
  occurrence_id: string;
  canonical_exercise_id: string;
  agenda_item_id: string | null;
  actual_order: number;
  set_role: 'WARMUP' | 'WORKING';
  measurement: Record<string, unknown>;
  load: Record<string, unknown> | null;
  machine: Record<string, unknown> | null;
  target_at_confirmation: Record<string, unknown> | null;
  completed_at: string;
};

export type ConfirmedSetSyncOutcome =
  | { state: 'idle' | 'inFlight' }
  | { state: 'acknowledged' | 'conflict'; mutationId: string }
  | {
      state: 'blocked';
      reason: 'dependency' | 'auth' | 'localData' | 'unsupported' | 'rejected';
    }
  | { state: 'retryable'; reason: 'network' | 'server' | 'invalidResponse' };

function currentSubject(access: LocalSubjectAccess): string {
  const raw = access.currentAuthenticatedSubject();
  if (!raw || !UUID.test(raw)) throw new LocalWorkoutError('notAuthenticated');
  return raw.toLowerCase();
}

function sameSubject(access: LocalSubjectAccess, expected: string): void {
  if (currentSubject(access) !== expected) {
    throw new LocalWorkoutError('notAuthenticated');
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  const item = object(value);
  if (item) {
    return Object.fromEntries(
      Object.entries(item)
        .sort(([left], [right]) => left.localeCompare(right, 'en'))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}
function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}
function parsedRecord(value: string): Record<string, unknown> | null {
  try {
    return object(JSON.parse(value));
  } catch {
    return null;
  }
}
function sameDecimal(left: unknown, right: unknown): boolean {
  return (
    typeof left === 'string' &&
    typeof right === 'string' &&
    DECIMAL.test(left) &&
    DECIMAL.test(right) &&
    Number(left) === Number(right)
  );
}

function readCommand(
  row: PendingSet,
  performed: LocalPerformedSet,
  occurrence: Occurrence,
): Command | null {
  let raw: unknown;
  try {
    raw = JSON.parse(row.payload_json);
  } catch {
    return null;
  }
  const value = object(raw);
  if (
    !value ||
    row.protocol_version !== 1 ||
    value.protocol_version !== 1 ||
    value.kind !== row.mutation_kind ||
    ![KIND_FIRST, KIND_ADDITIONAL].includes(row.mutation_kind) ||
    value.session_id !== row.session_id ||
    value.mutation_id !== row.mutation_id ||
    value.set_id !== performed.set_id ||
    value.occurrence_id !== performed.occurrence_id ||
    value.canonical_exercise_id !== occurrence.canonical_exercise_id ||
    value.agenda_item_id !== occurrence.agenda_item_id ||
    value.actual_order !== occurrence.actual_order ||
    value.set_role !== performed.set_role ||
    value.completed_at !== performed.completed_at_utc ||
    performed.session_id !== row.session_id ||
    performed.mutation_id !== row.mutation_id ||
    performed.subject !== row.subject ||
    (row.mutation_kind === KIND_FIRST &&
      occurrence.first_set_id !== performed.set_id) ||
    (row.mutation_kind === KIND_ADDITIONAL &&
      occurrence.first_set_id === performed.set_id)
  )
    return null;
  const measurement = object(value.measurement);
  if (
    !measurement ||
    measurement.measurementType !== performed.measurement_type
  ) {
    return null;
  }
  if (
    (performed.measurement_type === 'reps' &&
      measurement.reps !== performed.reps) ||
    (performed.measurement_type === 'time' &&
      measurement.durationSeconds !== performed.duration_seconds) ||
    (performed.measurement_type === 'distance' &&
      (!sameDecimal(measurement.distanceDecimal, performed.distance_decimal) ||
        measurement.distanceUnit !== performed.distance_unit))
  )
    return null;
  const load = value.load === null ? null : object(value.load);
  if (value.load !== null && !load) return null;
  if (
    (performed.load_decimal === null) !== (load === null) ||
    (load !== null &&
      (!sameDecimal(load.decimal, performed.load_decimal) ||
        load.unit !== performed.load_unit ||
        load.entrySemantics !== performed.load_entry_semantics))
  )
    return null;
  // A locally persisted machine/target may never disappear merely because a
  // queued command is corrupt or stale. Compare the two representations first.
  if (
    (value.machine === null &&
      (performed.machine_profile_id !== null ||
        performed.machine_configuration_id !== null ||
        performed.machine_snapshot_json !== null)) ||
    (value.target_at_confirmation === null &&
      performed.target_at_confirmation_json !== null)
  )
    return null;
  // No local machine-creation receipts or applied-agenda authority exist yet.
  // Keep them pending for later causal slices rather than generating remote 404
  // or, worse, a success whose provenance is unsourced.
  if (value.machine !== null) {
    const machine = object(value.machine);
    const snapshot = machine && object(machine.snapshot);
    const storedSnapshot =
      performed.machine_snapshot_json &&
      parsedRecord(performed.machine_snapshot_json);
    if (
      !machine ||
      !snapshot ||
      !storedSnapshot ||
      typeof machine.profileId !== 'string' ||
      !UUID.test(machine.profileId) ||
      machine.profileId.toLowerCase() !== performed.machine_profile_id ||
      (machine.configurationId !== null &&
        machine.configurationId !== undefined &&
        (typeof machine.configurationId !== 'string' ||
          !UUID.test(machine.configurationId))) ||
      (typeof machine.configurationId === 'string'
        ? machine.configurationId.toLowerCase()
        : null) !== performed.machine_configuration_id ||
      !sameJson(snapshot, storedSnapshot)
    )
      return null;
  }
  if (value.target_at_confirmation !== null) {
    const target = object(value.target_at_confirmation);
    const stored =
      performed.target_at_confirmation_json &&
      parsedRecord(performed.target_at_confirmation_json);
    if (!target || !stored || !sameJson(target, stored)) return null;
  }
  return value as Command;
}

function matchingReceipt(body: unknown, cmd: Command): boolean {
  const data = object(body);
  const measurement = cmd.measurement;
  const load = cmd.load;
  if (
    !data ||
    data.session_id !== cmd.session_id ||
    data.mutation_id !== cmd.mutation_id ||
    data.occurrence_id !== cmd.occurrence_id ||
    data.set_id !== cmd.set_id ||
    data.set_role !== cmd.set_role ||
    data.measurement_type !== measurement.measurementType ||
    data.load_unit !== (load?.unit ?? null) ||
    data.machine_profile_id !== (cmd.machine?.profileId ?? null) ||
    (data.machine_configuration_id ?? null) !==
      (cmd.machine?.configurationId ?? null) ||
    (load === null && data.load_decimal !== null) ||
    (load !== null && !sameDecimal(data.load_decimal, load.decimal)) ||
    typeof data.completed_at !== 'string'
  )
    return false;
  const serverTime = Date.parse(data.completed_at);
  const localTime = Date.parse(cmd.completed_at);
  return Number.isFinite(serverTime) && serverTime === localTime;
}

/**
 * A machine-bound set is deliverable only after the exact owner-owned CREATE
 * operations have been acknowledged locally. Legacy diagnostic snapshots from
 * before SQLite v3 have no CREATE receipt: keep them pending, never invent one.
 */
async function machineReady(
  db: SqliteWorkoutPort,
  access: LocalSubjectAccess,
  subject: string,
  cmd: Command,
): Promise<'ready' | 'dependency' | 'localData'> {
  if (!cmd.machine) return 'ready';
  const profileId = String(cmd.machine.profileId);
  const profile = await db.getFirstAsync<MachineProfileRow>(
    'SELECT * FROM local_machine_profiles WHERE subject = ? AND profile_id = ?',
    subject,
    profileId,
  );
  sameSubject(access, subject);
  if (!profile) return 'dependency';
  if (
    profile.subject !== subject ||
    profile.profile_id !== profileId ||
    !UUID.test(profile.create_mutation_id)
  )
    return 'localData';
  const profileCreate = await db.getFirstAsync<MachineCreateRow>(
    'SELECT * FROM local_machine_outbox WHERE subject = ? AND mutation_id = ?',
    subject,
    profile.create_mutation_id,
  );
  sameSubject(access, subject);
  if (!profileCreate) return 'dependency';
  const payload = parsedRecord(profileCreate.payload_json);
  if (
    profileCreate.subject !== subject ||
    profileCreate.protocol_version !== 1 ||
    profileCreate.mutation_kind !== 'CREATE_MACHINE_PROFILE' ||
    profileCreate.mutation_id !== profile.create_mutation_id ||
    profileCreate.profile_id !== profileId ||
    profileCreate.entity_id !== profileId ||
    profileCreate.depends_on_mutation_id !== null ||
    !payload ||
    payload.kind !== 'CREATE_MACHINE_PROFILE' ||
    payload.mutation_id !== profileCreate.mutation_id ||
    payload.profile_id !== profileId ||
    payload.native_load_unit !== profile.native_load_unit ||
    payload.load_entry_semantics !== profile.load_entry_semantics ||
    payload.metadata_source !== 'user_entered'
  )
    return 'localData';
  if (profileCreate.delivery_state !== 'acknowledged') return 'dependency';
  if (
    cmd.load !== null &&
    ((profile.native_load_unit !== null &&
      cmd.load.unit !== profile.native_load_unit) ||
      (profile.load_entry_semantics !== null &&
        cmd.load.entrySemantics !== profile.load_entry_semantics))
  )
    return 'localData';

  const configId = cmd.machine.configurationId;
  if (configId === null || configId === undefined) return 'ready';
  const config = await db.getFirstAsync<MachineConfigurationRow>(
    'SELECT * FROM local_machine_configurations WHERE subject = ? AND configuration_id = ?',
    subject,
    String(configId),
  );
  sameSubject(access, subject);
  if (!config) return 'dependency';
  if (
    config.subject !== subject ||
    config.profile_id !== profileId ||
    config.configuration_id !== configId ||
    !UUID.test(config.create_mutation_id)
  )
    return 'localData';
  const configCreate = await db.getFirstAsync<MachineCreateRow>(
    'SELECT * FROM local_machine_outbox WHERE subject = ? AND mutation_id = ?',
    subject,
    config.create_mutation_id,
  );
  sameSubject(access, subject);
  if (!configCreate) return 'dependency';
  const configPayload = parsedRecord(configCreate.payload_json);
  if (
    configCreate.subject !== subject ||
    configCreate.protocol_version !== 1 ||
    configCreate.mutation_kind !== 'CREATE_MACHINE_CONFIGURATION' ||
    configCreate.mutation_id !== config.create_mutation_id ||
    configCreate.profile_id !== profileId ||
    configCreate.entity_id !== configId ||
    configCreate.depends_on_mutation_id !== profile.create_mutation_id ||
    !configPayload ||
    configPayload.kind !== 'CREATE_MACHINE_CONFIGURATION' ||
    configPayload.mutation_id !== configCreate.mutation_id ||
    configPayload.profile_id !== profileId ||
    configPayload.configuration_id !== configId ||
    configPayload.metadata_source !== 'user_entered'
  )
    return 'localData';
  return configCreate.delivery_state === 'acknowledged'
    ? 'ready'
    : 'dependency';
}

async function send(
  row: PendingSet,
  token: string,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const route = row.mutation_kind === KIND_FIRST ? 'first' : 'additional';
  try {
    const response = await requestApi(
      `/workout-sessions/${row.session_id}/sets/${route}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: row.payload_json,
        signal: controller.signal,
      },
    );
    if (response.status !== 201) return { status: response.status, body: null };
    try {
      return { status: 201, body: await response.json() };
    } catch {
      return { status: 201, body: null };
    }
  } finally {
    clearTimeout(timer);
  }
}

async function transition(
  db: SqliteWorkoutPort,
  access: LocalSubjectAccess,
  row: PendingSet,
  performed: LocalPerformedSet,
  command: Command,
  state: 'acknowledged' | 'conflict',
): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    sameSubject(access, row.subject);
    const fresh = await tx.getFirstAsync<PendingSet>(
      'SELECT * FROM local_workout_outbox WHERE subject = ? AND mutation_id = ?',
      row.subject,
      row.mutation_id,
    );
    if (
      !fresh ||
      fresh.subject !== row.subject ||
      fresh.delivery_state !== 'pending' ||
      fresh.payload_json !== row.payload_json ||
      fresh.depends_on_mutation_id !== row.depends_on_mutation_id ||
      fresh.session_id !== row.session_id ||
      fresh.mutation_kind !== row.mutation_kind
    )
      throw new LocalWorkoutError('corruptLocalData');
    const parent = await tx.getFirstAsync<ParentState>(
      'SELECT mutation_id, session_id, delivery_state FROM local_workout_outbox WHERE subject = ? AND mutation_id = ?',
      row.subject,
      row.depends_on_mutation_id,
    );
    if (
      !parent ||
      parent.session_id !== row.session_id ||
      parent.delivery_state !== 'acknowledged'
    ) {
      throw new LocalWorkoutError('corruptLocalData');
    }
    const currentSet = await tx.getFirstAsync<LocalPerformedSet>(
      'SELECT * FROM local_workout_sets WHERE subject = ? AND mutation_id = ?',
      row.subject,
      row.mutation_id,
    );
    sameSubject(access, row.subject);
    if (!currentSet || !sameJson(currentSet, performed)) {
      throw new LocalWorkoutError('corruptLocalData');
    }
    const currentOccurrence = await tx.getFirstAsync<Occurrence>(
      'SELECT * FROM local_workout_occurrences WHERE subject = ? AND session_id = ? AND occurrence_id = ?',
      row.subject,
      row.session_id,
      currentSet.occurrence_id,
    );
    sameSubject(access, row.subject);
    if (
      !currentOccurrence ||
      !sameJson(readCommand(row, currentSet, currentOccurrence), command) ||
      (await machineReady(
        tx as SqliteWorkoutPort,
        access,
        row.subject,
        command,
      )) !== 'ready'
    ) {
      throw new LocalWorkoutError('corruptLocalData');
    }
    sameSubject(access, row.subject);
    await tx.runAsync(
      "UPDATE local_workout_outbox SET delivery_state = ? WHERE subject = ? AND mutation_id = ? AND delivery_state = 'pending'",
      state,
      row.subject,
      row.mutation_id,
    );
    const checked = await tx.getFirstAsync<PendingSet>(
      'SELECT * FROM local_workout_outbox WHERE subject = ? AND mutation_id = ?',
      row.subject,
      row.mutation_id,
    );
    if (
      checked?.delivery_state !== state ||
      checked.payload_json !== row.payload_json
    )
      throw new LocalWorkoutError('corruptLocalData');
    sameSubject(access, row.subject);
  });
  sameSubject(access, row.subject);
}

/** One explicitly invoked, causally ready confirmed-set mutation at most. */
export async function syncNextPendingConfirmedSet(
  db: SqliteWorkoutPort,
  access: StartSyncAccess,
): Promise<ConfirmedSetSyncOutcome> {
  if (inFlight.has(db)) return { state: 'inFlight' };
  inFlight.add(db);
  try {
    const subject = currentSubject(access);
    const row = await db.getFirstAsync<PendingSet>(
      "SELECT * FROM local_workout_outbox WHERE subject = ? AND mutation_kind IN ('CONFIRM_FIRST_SET_WITH_OCCURRENCE', 'CONFIRM_ADDITIONAL_SET') AND delivery_state = 'pending' ORDER BY rowid LIMIT 1",
      subject,
    );
    sameSubject(access, subject);
    if (!row) return { state: 'idle' };
    if (
      row.subject !== subject ||
      !UUID.test(row.mutation_id) ||
      !UUID.test(row.session_id) ||
      row.delivery_state !== 'pending'
    ) {
      return { state: 'blocked', reason: 'localData' };
    }
    if (!row.depends_on_mutation_id || !UUID.test(row.depends_on_mutation_id)) {
      return { state: 'blocked', reason: 'localData' };
    }
    const predecessor = await db.getFirstAsync<ParentState>(
      'SELECT mutation_id, session_id, delivery_state FROM local_workout_outbox WHERE subject = ? AND mutation_id = ?',
      subject,
      row.depends_on_mutation_id,
    );
    sameSubject(access, subject);
    if (
      !predecessor ||
      predecessor.session_id !== row.session_id ||
      predecessor.delivery_state !== 'acknowledged'
    ) {
      return { state: 'blocked', reason: 'dependency' };
    }
    const stored = await db.getFirstAsync<LocalPerformedSet>(
      'SELECT * FROM local_workout_sets WHERE subject = ? AND mutation_id = ?',
      subject,
      row.mutation_id,
    );
    sameSubject(access, subject);
    if (!stored) return { state: 'blocked', reason: 'localData' };
    const occurrence = await db.getFirstAsync<Occurrence>(
      'SELECT * FROM local_workout_occurrences WHERE subject = ? AND session_id = ? AND occurrence_id = ?',
      subject,
      row.session_id,
      stored.occurrence_id,
    );
    sameSubject(access, subject);
    if (!occurrence) return { state: 'blocked', reason: 'localData' };
    const cmd = readCommand(row, stored, occurrence);
    if (!cmd) return { state: 'blocked', reason: 'localData' };
    if (cmd.agenda_item_id !== null || cmd.target_at_confirmation !== null) {
      return { state: 'blocked', reason: 'unsupported' };
    }
    const machine = await machineReady(db, access, subject, cmd);
    sameSubject(access, subject);
    if (machine !== 'ready') return { state: 'blocked', reason: machine };
    const credential = await access.acquireCurrentCredentials();
    sameSubject(access, subject);
    if (
      !credential ||
      !UUID.test(credential.subject) ||
      credential.subject.toLowerCase() !== subject ||
      !credential.accessToken
    )
      return { state: 'blocked', reason: 'auth' };

    let result: { status: number; body: unknown };
    try {
      sameSubject(access, subject);
      result = await send(row, credential.accessToken);
    } catch {
      sameSubject(access, subject);
      return { state: 'retryable', reason: 'network' };
    }
    sameSubject(access, subject);
    if (result.status === 401 || result.status === 403) {
      return { state: 'blocked', reason: 'auth' };
    }
    if (result.status === 429 || result.status >= 500) {
      return { state: 'retryable', reason: 'server' };
    }
    if (result.status === 409) {
      await transition(db, access, row, stored, cmd, 'conflict');
      return { state: 'conflict', mutationId: row.mutation_id };
    }
    if (result.status !== 201) return { state: 'blocked', reason: 'rejected' };
    if (!matchingReceipt(result.body, cmd)) {
      return { state: 'retryable', reason: 'invalidResponse' };
    }
    await transition(db, access, row, stored, cmd, 'acknowledged');
    return { state: 'acknowledged', mutationId: row.mutation_id };
  } finally {
    inFlight.delete(db);
  }
}
