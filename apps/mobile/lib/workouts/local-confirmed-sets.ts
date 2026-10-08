/**
 * M3 performed-work boundary, independent of network/API availability.
 *
 * A selected exercise or a draft set NEVER creates performed history here.
 * Explicit confirmation commits an actual set, (first time) its occurrence,
 * and an immutable causally dependent outbox command in ONE SQLite transaction.
 *
 * These are locally durable domain commands, NOT yet valid HTTP requests:
 * the backend first-set protocol will be implemented separately.
 */
import type { SqliteWorkoutPort } from './local-schema';
import {
  LocalWorkoutError,
  type LocalSubjectAccess,
  type LocalWorkoutSession,
} from './local-store';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL = /^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,3})?$/;

export type ConfirmedSetMeasurement =
  | {
      measurementType: 'reps';
      reps: number;
      durationSeconds?: never;
      distanceDecimal?: never;
      distanceUnit?: never;
    }
  | {
      measurementType: 'time';
      durationSeconds: number;
      reps?: never;
      distanceDecimal?: never;
      distanceUnit?: never;
    }
  | {
      measurementType: 'distance';
      distanceDecimal: string;
      distanceUnit: 'm' | 'km' | 'mi';
      reps?: never;
      durationSeconds?: never;
    };

export type PerformedLoad = {
  decimal: string;
  unit: 'kg' | 'lb';
  /** Native setting, not purported universal effective resistance. */
  entrySemantics: 'total' | 'per_implement' | 'machine_display' | 'assistance';
};

export type PerformedMachineContext = {
  profileId: string;
  configurationId?: string | null;
  /** Immutable snapshot of known material machine configuration at this set. */
  snapshot: Record<string, unknown>;
};

export type ConfirmLocalSetInput = {
  sessionId: string;
  mutationId: string;
  setId: string;
  occurrenceId: string;
  canonicalExerciseId: string;
  /** When supplied, this refers to the active agenda, not actual history. */
  agendaItemId?: string | null;
  actualOrder: number;
  firstSet: boolean;
  setRole: 'WARMUP' | 'WORKING';
  measurement: ConfirmedSetMeasurement;
  load: PerformedLoad | null;
  machine: PerformedMachineContext | null;
  targetAtConfirmation: Record<string, unknown> | null;
  completedAtUtc: string;
};

export type LocalPerformedSet = {
  subject: string;
  session_id: string;
  set_id: string;
  occurrence_id: string;
  set_role: 'WARMUP' | 'WORKING';
  measurement_type: 'reps' | 'time' | 'distance';
  reps: number | null;
  duration_seconds: number | null;
  distance_decimal: string | null;
  distance_unit: string | null;
  load_decimal: string | null;
  load_unit: string | null;
  load_entry_semantics: string | null;
  machine_profile_id: string | null;
  machine_configuration_id: string | null;
  machine_snapshot_json: string | null;
  target_at_confirmation_json: string | null;
  completed_at_utc: string;
  mutation_id: string;
};

type LocalOccurrence = {
  subject: string;
  session_id: string;
  occurrence_id: string;
  canonical_exercise_id: string;
  actual_order: number;
  first_set_id: string;
};

type OutboxRecord = {
  payload_json: string;
  mutation_kind: string;
  session_id: string;
};

type PriorMutation = { mutation_id: string };

export class LocalConfirmedSetError extends Error {
  constructor(
    public readonly code:
      | 'invalidInput'
      | 'sessionNotActive'
      | 'occurrenceAlreadyExists'
      | 'occurrenceMissing'
      | 'exerciseMismatch'
      | 'setIdConflict'
      | 'mutationConflict'
      | 'corruptLocalData',
  ) {
    super(code);
    this.name = 'LocalConfirmedSetError';
  }
}

function authenticatedSubject(access: LocalSubjectAccess): string {
  const raw = access.currentAuthenticatedSubject();
  if (!raw || !UUID.test(raw)) {
    throw new LocalWorkoutError('notAuthenticated');
  }
  return raw.toLowerCase();
}

function requireSameSubject(access: LocalSubjectAccess, subject: string): void {
  if (authenticatedSubject(access) !== subject) {
    throw new LocalWorkoutError('notAuthenticated');
  }
}

function validIsoInstant(value: string): boolean {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function validate(input: ConfirmLocalSetInput): void {
  const ids = [
    input.sessionId,
    input.mutationId,
    input.setId,
    input.occurrenceId,
    input.canonicalExerciseId,
  ];
  if (
    ids.some((id) => !UUID.test(id)) ||
    (input.agendaItemId != null && !UUID.test(input.agendaItemId)) ||
    !Number.isSafeInteger(input.actualOrder) ||
    input.actualOrder < 0 ||
    !validIsoInstant(input.completedAtUtc) ||
    !['WARMUP', 'WORKING'].includes(input.setRole)
  ) {
    throw new LocalConfirmedSetError('invalidInput');
  }
  const m = input.measurement;
  if (
    !m ||
    (m.measurementType === 'reps' &&
      (!Number.isSafeInteger(m.reps) ||
        m.reps <= 0 ||
        m.durationSeconds !== undefined ||
        m.distanceDecimal !== undefined ||
        m.distanceUnit !== undefined)) ||
    (m.measurementType === 'time' &&
      (!Number.isSafeInteger(m.durationSeconds) ||
        m.durationSeconds <= 0 ||
        m.reps !== undefined ||
        m.distanceDecimal !== undefined ||
        m.distanceUnit !== undefined)) ||
    (m.measurementType === 'distance' &&
      (!DECIMAL.test(m.distanceDecimal) ||
        Number(m.distanceDecimal) <= 0 ||
        !['m', 'km', 'mi'].includes(m.distanceUnit) ||
        m.reps !== undefined ||
        m.durationSeconds !== undefined)) ||
    !['reps', 'time', 'distance'].includes(m.measurementType)
  ) {
    throw new LocalConfirmedSetError('invalidInput');
  }
  if (
    input.load &&
    (!DECIMAL.test(input.load.decimal) ||
      !['kg', 'lb'].includes(input.load.unit) ||
      !['total', 'per_implement', 'machine_display', 'assistance'].includes(
        input.load.entrySemantics,
      ))
  ) {
    throw new LocalConfirmedSetError('invalidInput');
  }
  if (
    input.machine &&
    (!UUID.test(input.machine.profileId) ||
      (input.machine.configurationId != null &&
        !UUID.test(input.machine.configurationId)) ||
      !input.machine.snapshot ||
      typeof input.machine.snapshot !== 'object' ||
      Array.isArray(input.machine.snapshot))
  ) {
    throw new LocalConfirmedSetError('invalidInput');
  }
}

function normalized(input: ConfirmLocalSetInput): ConfirmLocalSetInput {
  return {
    ...input,
    sessionId: input.sessionId.toLowerCase(),
    mutationId: input.mutationId.toLowerCase(),
    setId: input.setId.toLowerCase(),
    occurrenceId: input.occurrenceId.toLowerCase(),
    canonicalExerciseId: input.canonicalExerciseId.toLowerCase(),
    agendaItemId: input.agendaItemId?.toLowerCase() ?? null,
    machine: input.machine
      ? {
          ...input.machine,
          profileId: input.machine.profileId.toLowerCase(),
          configurationId: input.machine.configurationId?.toLowerCase() ?? null,
        }
      : null,
  };
}

function immutablePayload(input: ConfirmLocalSetInput): string {
  return JSON.stringify({
    protocol_version: 1,
    kind: input.firstSet
      ? 'CONFIRM_FIRST_SET_WITH_OCCURRENCE'
      : 'CONFIRM_ADDITIONAL_SET',
    session_id: input.sessionId,
    mutation_id: input.mutationId,
    set_id: input.setId,
    occurrence_id: input.occurrenceId,
    canonical_exercise_id: input.canonicalExerciseId,
    agenda_item_id: input.agendaItemId,
    actual_order: input.actualOrder,
    set_role: input.setRole,
    measurement: input.measurement,
    load: input.load,
    machine: input.machine,
    target_at_confirmation: input.targetAtConfirmation,
    completed_at: input.completedAtUtc,
  });
}

export async function confirmLocalWorkoutSet(
  db: SqliteWorkoutPort,
  access: LocalSubjectAccess,
  raw: ConfirmLocalSetInput,
): Promise<LocalPerformedSet> {
  const subject = authenticatedSubject(access);
  validate(raw);
  // Materialize a deep, JSON-safe command snapshot BEFORE the first await.
  // Callers may edit nested draft/form objects while a SQLite query is pending:
  // outbox intent and performed history must always use the same frozen values.
  const input = JSON.parse(
    JSON.stringify(normalized(raw)),
  ) as ConfirmLocalSetInput;
  const payload = immutablePayload(input);
  const kind = input.firstSet
    ? 'CONFIRM_FIRST_SET_WITH_OCCURRENCE'
    : 'CONFIRM_ADDITIONAL_SET';
  let confirmed: LocalPerformedSet | null = null;

  await db.withExclusiveTransactionAsync(async (tx) => {
    requireSameSubject(access, subject);
    const duplicate = await tx.getFirstAsync<OutboxRecord>(
      'SELECT payload_json, mutation_kind, session_id FROM local_workout_outbox WHERE subject = ? AND mutation_id = ?',
      subject,
      input.mutationId,
    );
    if (duplicate) {
      if (
        duplicate.payload_json !== payload ||
        duplicate.mutation_kind !== kind ||
        duplicate.session_id !== input.sessionId
      ) {
        throw new LocalConfirmedSetError('mutationConflict');
      }
      confirmed = await tx.getFirstAsync<LocalPerformedSet>(
        'SELECT * FROM local_workout_sets WHERE subject = ? AND set_id = ? AND mutation_id = ?',
        subject,
        input.setId,
        input.mutationId,
      );
      if (!confirmed) {
        throw new LocalConfirmedSetError('corruptLocalData');
      }
      requireSameSubject(access, subject);
      return;
    }

    const session = await tx.getFirstAsync<LocalWorkoutSession>(
      'SELECT * FROM local_workout_sessions WHERE subject = ? AND session_id = ?',
      subject,
      input.sessionId,
    );
    if (!session || session.lifecycle_state !== 'active') {
      throw new LocalConfirmedSetError('sessionNotActive');
    }
    const existingSet = await tx.getFirstAsync<LocalPerformedSet>(
      'SELECT * FROM local_workout_sets WHERE subject = ? AND set_id = ?',
      subject,
      input.setId,
    );
    if (existingSet) {
      throw new LocalConfirmedSetError('setIdConflict');
    }
    const occurrence = await tx.getFirstAsync<LocalOccurrence>(
      'SELECT * FROM local_workout_occurrences WHERE subject = ? AND session_id = ? AND occurrence_id = ?',
      subject,
      input.sessionId,
      input.occurrenceId,
    );
    if (input.firstSet && occurrence) {
      throw new LocalConfirmedSetError('occurrenceAlreadyExists');
    }
    if (!input.firstSet && !occurrence) {
      throw new LocalConfirmedSetError('occurrenceMissing');
    }
    if (
      occurrence &&
      (occurrence.canonical_exercise_id !== input.canonicalExerciseId ||
        occurrence.actual_order !== input.actualOrder)
    ) {
      throw new LocalConfirmedSetError('exerciseMismatch');
    }
    const previous = await tx.getFirstAsync<PriorMutation>(
      'SELECT mutation_id FROM local_workout_outbox WHERE subject = ? AND session_id = ? ORDER BY rowid DESC LIMIT 1',
      subject,
      input.sessionId,
    );
    if (!previous) {
      // Every local set must depend on a durable START_SESSION, directly or
      // transitively; an outbox entry with no parent must never be sent.
      throw new LocalConfirmedSetError('corruptLocalData');
    }

    if (input.firstSet) {
      await tx.runAsync(
        `INSERT INTO local_workout_occurrences
          (subject, session_id, occurrence_id, canonical_exercise_id,
           agenda_item_id, actual_order, first_set_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        subject,
        input.sessionId,
        input.occurrenceId,
        input.canonicalExerciseId,
        input.agendaItemId ?? null,
        input.actualOrder,
        input.setId,
      );
    }

    // Outbox is written before the set because the set's FK references its
    // immutable mutation ID; everything is in the same exclusive transaction.
    await tx.runAsync(
      `INSERT INTO local_workout_outbox
        (subject, mutation_id, session_id, mutation_kind, protocol_version,
         payload_json, delivery_state, created_at_utc, depends_on_mutation_id)
       VALUES (?, ?, ?, ?, 1, ?, 'pending', ?, ?)`,
      subject,
      input.mutationId,
      input.sessionId,
      kind,
      payload,
      input.completedAtUtc,
      previous.mutation_id,
    );

    const m = input.measurement;
    await tx.runAsync(
      `INSERT INTO local_workout_sets
        (subject, session_id, set_id, occurrence_id, set_role,
         measurement_type, reps, duration_seconds, distance_decimal,
         distance_unit, load_decimal, load_unit, load_entry_semantics,
         machine_profile_id, machine_configuration_id, machine_snapshot_json,
         target_at_confirmation_json, completed_at_utc, mutation_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      subject,
      input.sessionId,
      input.setId,
      input.occurrenceId,
      input.setRole,
      m.measurementType,
      m.measurementType === 'reps' ? m.reps : null,
      m.measurementType === 'time' ? m.durationSeconds : null,
      m.measurementType === 'distance' ? m.distanceDecimal : null,
      m.measurementType === 'distance' ? m.distanceUnit : null,
      input.load?.decimal ?? null,
      input.load?.unit ?? null,
      input.load?.entrySemantics ?? null,
      input.machine?.profileId ?? null,
      input.machine?.configurationId ?? null,
      input.machine ? JSON.stringify(input.machine.snapshot) : null,
      input.targetAtConfirmation
        ? JSON.stringify(input.targetAtConfirmation)
        : null,
      input.completedAtUtc,
      input.mutationId,
    );
    confirmed = await tx.getFirstAsync<LocalPerformedSet>(
      'SELECT * FROM local_workout_sets WHERE subject = ? AND set_id = ? AND mutation_id = ?',
      subject,
      input.setId,
      input.mutationId,
    );
    if (!confirmed) {
      throw new LocalConfirmedSetError('corruptLocalData');
    }
    requireSameSubject(access, subject);
  });
  requireSameSubject(access, subject);
  if (!confirmed) {
    throw new LocalConfirmedSetError('corruptLocalData');
  }
  return confirmed;
}

export async function readLocalConfirmedSet(
  db: SqliteWorkoutPort,
  access: LocalSubjectAccess,
  setId: string,
): Promise<LocalPerformedSet | null> {
  const subject = authenticatedSubject(access);
  if (!UUID.test(setId)) {
    throw new LocalConfirmedSetError('invalidInput');
  }
  const result = await db.getFirstAsync<LocalPerformedSet>(
    'SELECT * FROM local_workout_sets WHERE subject = ? AND set_id = ?',
    subject,
    setId.toLowerCase(),
  );
  requireSameSubject(access, subject);
  return result;
}
