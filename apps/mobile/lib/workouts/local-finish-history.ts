/**
 * Read-only, account-fenced local history of explicitly completed workouts.
 *
 * This is a persistence/query foundation, NOT an exposed product screen or
 * a claim that a pending FINISH has reached PostgreSQL. It never invokes HTTP,
 * writes SQLite, modifies active sessions, or fabricates exercise names.
 */
import type { SqliteWorkoutPort } from './local-schema';
import {
  ACTIVE_WORKOUT_OVERVIEW_SQL,
  decodeActiveWorkoutExercises,
  type ActiveExerciseSummary,
} from './active-workout-overview';
import { LocalFinishError } from './local-finish';
import type { LocalSubjectAccess } from './local-store';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_STATES = new Set([
  'pending',
  'sending',
  'acknowledged',
  'blocked',
  'conflict',
  'terminal_error',
]);
const MAX_PAGE_SIZE = 50;

export type FinishedWorkoutHistoryEntry = {
  session_id: string;
  completion_snapshot_id: string;
  started_at_utc: string;
  finished_at_utc: string;
  local_date: string;
  total_sets: number;
  working_sets: number;
  /** SQLite outbox state. Only "acknowledged" means a durable remote ACK. */
  sync_state:
    | 'pending'
    | 'sending'
    | 'acknowledged'
    | 'blocked'
    | 'conflict'
    | 'terminal_error';
};

export type FinishedWorkoutHistoryPage = {
  limit?: number;
  offset?: number;
};

/**
 * Aggregate a deterministically ordered PAGE rather than all session rows.
 * Each join enforces subject ownership. JSON1 avoids changing the existing
 * SqliteQueryPort, which intentionally exposes single-row reads.
 */
export const LOCAL_FINISHED_HISTORY_SQL = [
  "SELECT COALESCE(json_group_array(json(item_json)), '[]') AS items_json",
  'FROM ( SELECT json_object(',
  "'session_id', f.session_id,",
  "'completion_snapshot_id', f.completion_snapshot_id,",
  "'started_at_utc', w.started_at_utc,",
  "'finished_at_utc', f.finished_at_utc,",
  "'local_date', w.local_date,",
  "'total_sets', (SELECT COUNT(*) FROM local_workout_sets AS s",
  'WHERE s.subject = f.subject AND s.session_id = f.session_id),',
  "'working_sets', (SELECT COUNT(*) FROM local_workout_sets AS s",
  "WHERE s.subject = f.subject AND s.session_id = f.session_id AND s.set_role = 'WORKING'),",
  "'sync_state', o.delivery_state",
  ') AS item_json',
  'FROM local_workout_final_snapshots AS f',
  'JOIN local_workout_sessions AS w ON w.subject = f.subject AND w.session_id = f.session_id',
  'JOIN local_workout_outbox AS o ON o.subject = f.subject AND o.mutation_id = f.finish_mutation_id',
  "WHERE f.subject = ? AND w.lifecycle_state = 'completed' AND o.mutation_kind = 'FINISH_SESSION'",
  'ORDER BY f.finished_at_utc DESC, f.session_id DESC',
  'LIMIT ? OFFSET ? )',
].join(' ');

function authenticatedSubject(access: LocalSubjectAccess): string {
  const subject = access.currentAuthenticatedSubject();
  if (!subject || !UUID.test(subject)) {
    throw new LocalFinishError('notAuthenticated');
  }
  return subject.toLowerCase();
}

function validEntry(value: unknown): value is FinishedWorkoutHistoryEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.session_id === 'string' &&
    UUID.test(row.session_id) &&
    typeof row.completion_snapshot_id === 'string' &&
    UUID.test(row.completion_snapshot_id) &&
    typeof row.started_at_utc === 'string' &&
    Number.isFinite(Date.parse(row.started_at_utc)) &&
    typeof row.finished_at_utc === 'string' &&
    Number.isFinite(Date.parse(row.finished_at_utc)) &&
    Date.parse(row.finished_at_utc) >= Date.parse(row.started_at_utc) &&
    typeof row.local_date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.local_date) &&
    Number.isSafeInteger(row.total_sets) &&
    (row.total_sets as number) > 0 &&
    Number.isSafeInteger(row.working_sets) &&
    (row.working_sets as number) >= 1 &&
    (row.working_sets as number) <= (row.total_sets as number) &&
    typeof row.sync_state === 'string' &&
    VALID_STATES.has(row.sync_state)
  );
}

/** A bounded page of local history; never makes a network request. */
export async function listLocalFinishedWorkouts(
  db: SqliteWorkoutPort,
  access: LocalSubjectAccess,
  options: FinishedWorkoutHistoryPage = {},
): Promise<FinishedWorkoutHistoryEntry[]> {
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_PAGE_SIZE ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    throw new LocalFinishError('invalidInput');
  }
  const subject = authenticatedSubject(access);
  const result = await db.getFirstAsync<{ items_json: string }>(
    LOCAL_FINISHED_HISTORY_SQL,
    subject,
    limit,
    offset,
  );
  if (authenticatedSubject(access) !== subject) {
    throw new LocalFinishError('notAuthenticated');
  }
  let parsed: unknown;
  try {
    if (typeof result?.items_json !== 'string') {
      throw new Error('Missing SQLite JSON1 result');
    }
    parsed = JSON.parse(result.items_json);
  } catch {
    throw new LocalFinishError('corruptLocalData');
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length > limit ||
    !parsed.every(validEntry)
  ) {
    throw new LocalFinishError('corruptLocalData');
  }
  if (authenticatedSubject(access) !== subject) {
    throw new LocalFinishError('notAuthenticated');
  }
  return parsed as FinishedWorkoutHistoryEntry[];
}

/** One exact completed session, never active/cancelled/another account. */
export type FinishedWorkoutDetail = {
  entry: FinishedWorkoutHistoryEntry;
  exercises: ActiveExerciseSummary[];
};

export const LOCAL_FINISHED_DETAIL_GUARD_SQL = [
  'SELECT f.completion_snapshot_id, w.started_at_utc, f.finished_at_utc,',
  'w.local_date, o.delivery_state AS sync_state',
  'FROM local_workout_final_snapshots AS f',
  'JOIN local_workout_sessions AS w ON w.subject = f.subject AND w.session_id = f.session_id',
  'JOIN local_workout_outbox AS o ON o.subject = f.subject AND o.mutation_id = f.finish_mutation_id',
  "WHERE f.subject = ? AND f.session_id = ? AND w.lifecycle_state = 'completed'",
  "AND o.mutation_kind = 'FINISH_SESSION'",
].join(' ');

/**
 * Read only the performed ledger for a history entry already shown to the
 * authenticated owner. Never re-create an agenda or modify the outbox.
 * Every query is account-scoped; completed state and finish snapshot are
 * rechecked rather than trusting an ID carried by the UI.
 */
export async function readLocalFinishedWorkoutDetail(
  db: SqliteWorkoutPort,
  access: LocalSubjectAccess,
  entry: FinishedWorkoutHistoryEntry,
): Promise<FinishedWorkoutDetail> {
  const subject = authenticatedSubject(access);
  if (!validEntry(entry)) throw new LocalFinishError('invalidInput');

  const guard = await db.getFirstAsync<{
    completion_snapshot_id: string;
    started_at_utc: string;
    finished_at_utc: string;
    local_date: string;
    sync_state: string;
  }>(LOCAL_FINISHED_DETAIL_GUARD_SQL, subject, entry.session_id);

  if (authenticatedSubject(access) !== subject) {
    throw new LocalFinishError('notAuthenticated');
  }
  if (
    !guard ||
    guard.completion_snapshot_id !== entry.completion_snapshot_id ||
    guard.started_at_utc !== entry.started_at_utc ||
    guard.finished_at_utc !== entry.finished_at_utc ||
    guard.local_date !== entry.local_date ||
    !VALID_STATES.has(guard.sync_state)
  ) {
    throw new LocalFinishError('corruptLocalData');
  }

  const data = await db.getFirstAsync<{ items_json: string }>(
    ACTIVE_WORKOUT_OVERVIEW_SQL,
    subject,
    entry.session_id,
  );
  if (authenticatedSubject(access) !== subject) {
    throw new LocalFinishError('notAuthenticated');
  }
  let raw: unknown;
  try {
    if (typeof data?.items_json !== 'string') throw new Error('Missing ledger');
    raw = JSON.parse(data.items_json);
  } catch {
    throw new LocalFinishError('corruptLocalData');
  }

  let exercises: ActiveExerciseSummary[];
  try {
    exercises = decodeActiveWorkoutExercises(raw);
  } catch {
    throw new LocalFinishError('corruptLocalData');
  }
  const sets = exercises.flatMap((exercise) => exercise.sets);
  if (
    sets.length !== entry.total_sets ||
    sets.filter((set) => set.set_role === 'WORKING').length !==
      entry.working_sets ||
    sets.some(
      (set) =>
        Date.parse(set.completed_at_utc) < Date.parse(entry.started_at_utc) ||
        Date.parse(set.completed_at_utc) > Date.parse(entry.finished_at_utc),
    )
  ) {
    throw new LocalFinishError('corruptLocalData');
  }
  if (authenticatedSubject(access) !== subject) {
    throw new LocalFinishError('notAuthenticated');
  }
  return {
    entry: {
      ...entry,
      sync_state: guard.sync_state as FinishedWorkoutHistoryEntry['sync_state'],
    },
    exercises,
  };
}
