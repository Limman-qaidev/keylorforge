/**
 * Explicit offline-first Free Workout closure, without UI or network activity.
 * The accepted v3 model has only empty initial Free Workout agendas and no
 * persisted applied agenda changes. Reject richer agendas until implemented;
 * never fabricate unperformed items, adaptations or historical performance.
 */
import type { SqliteWorkoutPort } from './local-schema';
import type { LocalSubjectAccess, LocalWorkoutSession } from './local-store';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LocalFinishInput = {
  sessionId: string;
  mutationId: string;
  completionSnapshotId: string;
  finishedAtUtc: string;
};

export type PerformedOccurrenceSnapshot = {
  occurrence_id: string;
  canonical_exercise_id: string;
  actual_order: number;
  agenda_item_id: null;
  set_ids: string[];
};

export type LocalCompletionSnapshot = {
  schema_version: 1;
  completion_snapshot_id: string;
  session_id: string;
  origin: 'free';
  original_agenda: { schema_version: 1; origin: 'free'; items: [] };
  final_agenda_revision: 0;
  applied_agenda_change_ids: [];
  agenda_items: [];
  unplanned_performed_occurrences: PerformedOccurrenceSnapshot[];
  finished_at_utc: string;
  time_zone: string;
  local_date: string;
};

export type LocalFinishRow = {
  subject: string;
  session_id: string;
  finish_mutation_id: string;
  completion_snapshot_id: string;
  finished_at_utc: string;
  final_agenda_json: string;
};

type ExistingOutbox = {
  mutation_kind: string;
  session_id: string;
  payload_json: string;
};
type PriorOutbox = { mutation_id: string };
type CountRow = { count: number };
type JsonItemsRow = { items_json: string };

export class LocalFinishError extends Error {
  constructor(
    public readonly code:
      | 'invalidInput'
      | 'notAuthenticated'
      | 'sessionNotActive'
      | 'alreadyFinished'
      | 'noQualifyingWork'
      | 'unsupportedAgenda'
      | 'invalidHistory'
      | 'missingDependency'
      | 'mutationConflict'
      | 'corruptLocalData',
  ) {
    super(code);
    this.name = 'LocalFinishError';
  }
}

function currentSubject(access: LocalSubjectAccess): string {
  const raw = access.currentAuthenticatedSubject();
  if (!raw || !UUID.test(raw)) {
    throw new LocalFinishError('notAuthenticated');
  }
  return raw.toLowerCase();
}

function fence(access: LocalSubjectAccess, subject: string): void {
  if (currentSubject(access) !== subject) {
    throw new LocalFinishError('notAuthenticated');
  }
}

function normalized(input: LocalFinishInput): LocalFinishInput {
  const values = [
    input?.sessionId,
    input?.mutationId,
    input?.completionSnapshotId,
  ];
  if (
    values.some((value) => typeof value !== 'string' || !UUID.test(value)) ||
    typeof input.finishedAtUtc !== 'string'
  ) {
    throw new LocalFinishError('invalidInput');
  }
  const parsed = new Date(input.finishedAtUtc);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString() !== input.finishedAtUtc
  ) {
    throw new LocalFinishError('invalidInput');
  }
  return {
    sessionId: input.sessionId.toLowerCase(),
    mutationId: input.mutationId.toLowerCase(),
    completionSnapshotId: input.completionSnapshotId.toLowerCase(),
    finishedAtUtc: input.finishedAtUtc,
  };
}

function emptyAgenda(
  session: LocalWorkoutSession,
): LocalCompletionSnapshot['original_agenda'] {
  let agenda: unknown;
  try {
    agenda = JSON.parse(session.original_agenda_json);
  } catch {
    throw new LocalFinishError('corruptLocalData');
  }
  if (
    !agenda ||
    typeof agenda !== 'object' ||
    Array.isArray(agenda) ||
    !Array.isArray((agenda as { items?: unknown }).items) ||
    (agenda as { items: unknown[] }).items.length !== 0 ||
    (agenda as { schema_version?: unknown }).schema_version !== 1 ||
    (agenda as { origin?: unknown }).origin !== 'free' ||
    session.agenda_revision !== 0 ||
    session.origin !== 'free'
  ) {
    throw new LocalFinishError('unsupportedAgenda');
  }
  return { schema_version: 1, origin: 'free', items: [] };
}

/** Read all committed occurrences and sets; sorted deterministic JSON1 output. */
const PERFORMED_SQL = [
  "SELECT COALESCE(json_group_array(json(item_json)), '[]') AS items_json",
  'FROM ( SELECT json_object(',
  "'occurrence_id', o.occurrence_id,",
  "'canonical_exercise_id', o.canonical_exercise_id,",
  "'actual_order', o.actual_order,",
  "'agenda_item_id', o.agenda_item_id,",
  "'set_ids', json((SELECT COALESCE(json_group_array(set_id), '[]') FROM (",
  'SELECT s.set_id FROM local_workout_sets AS s',
  'WHERE s.subject = o.subject AND s.session_id = o.session_id',
  'AND s.occurrence_id = o.occurrence_id',
  'ORDER BY s.completed_at_utc, s.set_id',
  ')))) AS item_json',
  'FROM local_workout_occurrences AS o',
  'WHERE o.subject = ? AND o.session_id = ?',
  'ORDER BY o.actual_order, o.occurrence_id )',
].join(' ');

function parsePerformed(json: string): PerformedOccurrenceSnapshot[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new LocalFinishError('invalidHistory');
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new LocalFinishError('invalidHistory');
  }
  const occurrences = new Set<string>();
  const sets = new Set<string>();
  for (const entry of raw) {
    const row = entry as Partial<PerformedOccurrenceSnapshot> | null;
    if (
      !row ||
      !UUID.test(row.occurrence_id ?? '') ||
      !UUID.test(row.canonical_exercise_id ?? '') ||
      typeof row.actual_order !== 'number' ||
      !Number.isSafeInteger(row.actual_order) ||
      (row.actual_order ?? -1) < 0 ||
      row.agenda_item_id !== null ||
      !Array.isArray(row.set_ids) ||
      row.set_ids.length === 0 ||
      row.set_ids.some((id) => typeof id !== 'string' || !UUID.test(id)) ||
      occurrences.has(row.occurrence_id!)
    ) {
      throw new LocalFinishError('invalidHistory');
    }
    occurrences.add(row.occurrence_id!);
    for (const id of row.set_ids) {
      if (sets.has(id)) throw new LocalFinishError('invalidHistory');
      sets.add(id);
    }
  }
  return raw as PerformedOccurrenceSnapshot[];
}

type FinishPayload = {
  protocol_version: number;
  kind: string;
  session_id: string;
  mutation_id: string;
  completion_snapshot: LocalCompletionSnapshot;
};

function previousPayload(json: string): FinishPayload {
  try {
    const parsed: FinishPayload = JSON.parse(json);
    if (
      parsed.protocol_version !== 1 ||
      parsed.kind !== 'FINISH_SESSION' ||
      !parsed.completion_snapshot ||
      typeof parsed.completion_snapshot !== 'object'
    ) {
      throw new Error('Malformed local payload');
    }
    return parsed;
  } catch {
    throw new LocalFinishError('corruptLocalData');
  }
}

export async function finishLocalFreeWorkout(
  db: SqliteWorkoutPort,
  access: LocalSubjectAccess,
  raw: LocalFinishInput,
): Promise<LocalFinishRow> {
  const subject = currentSubject(access);
  const input = normalized(raw);
  let saved: LocalFinishRow | null = null;
  await db.withExclusiveTransactionAsync(async (tx) => {
    fence(access, subject);
    const duplicate = await tx.getFirstAsync<ExistingOutbox>(
      'SELECT mutation_kind, session_id, payload_json FROM local_workout_outbox WHERE subject = ? AND mutation_id = ?',
      subject,
      input.mutationId,
    );
    if (duplicate) {
      if (
        duplicate.mutation_kind !== 'FINISH_SESSION' ||
        duplicate.session_id !== input.sessionId
      ) {
        throw new LocalFinishError('mutationConflict');
      }
      const prior = previousPayload(duplicate.payload_json);
      if (
        prior.mutation_id !== input.mutationId ||
        prior.session_id !== input.sessionId ||
        prior.completion_snapshot.completion_snapshot_id !==
          input.completionSnapshotId ||
        prior.completion_snapshot.finished_at_utc !== input.finishedAtUtc
      ) {
        throw new LocalFinishError('mutationConflict');
      }
      const row = await tx.getFirstAsync<LocalFinishRow>(
        'SELECT * FROM local_workout_final_snapshots WHERE subject = ? AND session_id = ?',
        subject,
        input.sessionId,
      );
      const session = await tx.getFirstAsync<LocalWorkoutSession>(
        'SELECT * FROM local_workout_sessions WHERE subject = ? AND session_id = ?',
        subject,
        input.sessionId,
      );
      if (
        !row ||
        row.finish_mutation_id !== input.mutationId ||
        row.completion_snapshot_id !== input.completionSnapshotId ||
        row.finished_at_utc !== input.finishedAtUtc ||
        row.final_agenda_json !== JSON.stringify(prior.completion_snapshot) ||
        session?.lifecycle_state !== 'completed'
      ) {
        throw new LocalFinishError('corruptLocalData');
      }
      saved = row;
      fence(access, subject);
      return;
    }

    const session = await tx.getFirstAsync<LocalWorkoutSession>(
      'SELECT * FROM local_workout_sessions WHERE subject = ? AND session_id = ?',
      subject,
      input.sessionId,
    );
    if (!session || session.lifecycle_state !== 'active') {
      throw new LocalFinishError('sessionNotActive');
    }
    if (Date.parse(input.finishedAtUtc) < Date.parse(session.started_at_utc)) {
      throw new LocalFinishError('invalidInput');
    }
    const originalAgenda = emptyAgenda(session);
    const existing = await tx.getFirstAsync<LocalFinishRow>(
      'SELECT * FROM local_workout_final_snapshots WHERE subject = ? AND session_id = ?',
      subject,
      input.sessionId,
    );
    if (existing) throw new LocalFinishError('alreadyFinished');
    const work = await tx.getFirstAsync<CountRow>(
      "SELECT COUNT(*) AS count FROM local_workout_sets WHERE subject = ? AND session_id = ? AND set_role = 'WORKING'",
      subject,
      input.sessionId,
    );
    if (!work || work.count < 1) {
      throw new LocalFinishError('noQualifyingWork');
    }
    const allSets = await tx.getFirstAsync<CountRow>(
      'SELECT COUNT(*) AS count FROM local_workout_sets WHERE subject = ? AND session_id = ?',
      subject,
      input.sessionId,
    );
    const performed = await tx.getFirstAsync<JsonItemsRow>(
      PERFORMED_SQL,
      subject,
      input.sessionId,
    );
    const entries = parsePerformed(performed?.items_json ?? '');
    if (
      !allSets ||
      entries.reduce((total, entry) => total + entry.set_ids.length, 0) !==
        allSets.count
    ) {
      throw new LocalFinishError('invalidHistory');
    }
    const parent = await tx.getFirstAsync<PriorOutbox>(
      'SELECT mutation_id FROM local_workout_outbox WHERE subject = ? AND session_id = ? ORDER BY rowid DESC LIMIT 1',
      subject,
      input.sessionId,
    );
    if (!parent) throw new LocalFinishError('missingDependency');
    const snapshot: LocalCompletionSnapshot = {
      schema_version: 1,
      completion_snapshot_id: input.completionSnapshotId,
      session_id: input.sessionId,
      origin: 'free',
      original_agenda: originalAgenda,
      final_agenda_revision: 0,
      applied_agenda_change_ids: [],
      agenda_items: [],
      unplanned_performed_occurrences: entries,
      finished_at_utc: input.finishedAtUtc,
      time_zone: session.time_zone,
      local_date: session.local_date,
    };
    const snapshotJson = JSON.stringify(snapshot);
    const payload = JSON.stringify({
      protocol_version: 1,
      kind: 'FINISH_SESSION',
      session_id: input.sessionId,
      mutation_id: input.mutationId,
      completion_snapshot: snapshot,
    });
    await tx.runAsync(
      "INSERT INTO local_workout_outbox (subject, mutation_id, session_id, mutation_kind, protocol_version, payload_json, delivery_state, created_at_utc, depends_on_mutation_id) VALUES (?, ?, ?, 'FINISH_SESSION', 1, ?, 'pending', ?, ?)",
      subject,
      input.mutationId,
      input.sessionId,
      payload,
      input.finishedAtUtc,
      parent.mutation_id,
    );
    await tx.runAsync(
      'INSERT INTO local_workout_final_snapshots (subject, session_id, finish_mutation_id, completion_snapshot_id, finished_at_utc, final_agenda_json) VALUES (?, ?, ?, ?, ?, ?)',
      subject,
      input.sessionId,
      input.mutationId,
      input.completionSnapshotId,
      input.finishedAtUtc,
      snapshotJson,
    );
    await tx.runAsync(
      "UPDATE local_workout_sessions SET lifecycle_state = 'completed' WHERE subject = ? AND session_id = ? AND lifecycle_state = 'active'",
      subject,
      input.sessionId,
    );
    saved = await tx.getFirstAsync<LocalFinishRow>(
      'SELECT * FROM local_workout_final_snapshots WHERE subject = ? AND session_id = ?',
      subject,
      input.sessionId,
    );
    const completed = await tx.getFirstAsync<LocalWorkoutSession>(
      'SELECT * FROM local_workout_sessions WHERE subject = ? AND session_id = ?',
      subject,
      input.sessionId,
    );
    if (!saved || completed?.lifecycle_state !== 'completed') {
      throw new LocalFinishError('corruptLocalData');
    }
    fence(access, subject);
  });
  fence(access, subject);
  if (!saved) throw new LocalFinishError('corruptLocalData');
  return saved;
}

export async function readLocalFinishedWorkout(
  db: SqliteWorkoutPort,
  access: LocalSubjectAccess,
  sessionId: string,
): Promise<LocalFinishRow | null> {
  const subject = currentSubject(access);
  if (!UUID.test(sessionId)) throw new LocalFinishError('invalidInput');
  const result = await db.getFirstAsync<LocalFinishRow>(
    'SELECT * FROM local_workout_final_snapshots WHERE subject = ? AND session_id = ?',
    subject,
    sessionId.toLowerCase(),
  );
  fence(access, subject);
  return result;
}
