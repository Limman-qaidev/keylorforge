/**
 * Read-only active Free Workout view model backed by owner-scoped SQLite.
 * No draft selection becomes performed history. The real sets are returned
 * exactly as persisted, never inferred from catalogue metadata or an agenda.
 */
import type { SqliteWorkoutPort } from './local-schema';
import {
  LocalWorkoutError,
  getActiveLocalWorkout,
  type LocalSubjectAccess,
  type LocalWorkoutSession,
} from './local-store';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ActiveSetSummary = {
  set_id: string;
  set_role: 'WARMUP' | 'WORKING';
  measurement_type: 'reps' | 'time' | 'distance';
  reps: number | null;
  duration_seconds: number | null;
  distance_decimal: string | null;
  distance_unit: 'm' | 'km' | 'mi' | null;
  load_decimal: string | null;
  load_unit: 'kg' | 'lb' | null;
  completed_at_utc: string;
};

export type ActiveExerciseSummary = {
  occurrence_id: string;
  canonical_exercise_id: string;
  actual_order: number;
  agenda_item_id: null;
  sets: ActiveSetSummary[];
};

export type ActiveFreeWorkoutOverview = {
  session: LocalWorkoutSession;
  exercises: ActiveExerciseSummary[];
  totalSets: number;
  workingSets: number;
};

/** JSON1 returns an ordered set ledger, including mixed physical units. */
export const ACTIVE_WORKOUT_OVERVIEW_SQL = [
  "SELECT COALESCE(json_group_array(json(item_json)), '[]') AS items_json",
  'FROM ( SELECT json_object(',
  "'occurrence_id', o.occurrence_id,",
  "'canonical_exercise_id', o.canonical_exercise_id,",
  "'actual_order', o.actual_order,",
  "'agenda_item_id', o.agenda_item_id,",
  "'sets', json((SELECT COALESCE(json_group_array(json(set_json)), '[]') FROM (",
  'SELECT json_object(',
  "'set_id', s.set_id,",
  "'set_role', s.set_role,",
  "'measurement_type', s.measurement_type,",
  "'reps', s.reps,",
  "'duration_seconds', s.duration_seconds,",
  "'distance_decimal', s.distance_decimal,",
  "'distance_unit', s.distance_unit,",
  "'load_decimal', s.load_decimal,",
  "'load_unit', s.load_unit,",
  "'completed_at_utc', s.completed_at_utc",
  ') AS set_json FROM local_workout_sets AS s',
  'WHERE s.subject = o.subject AND s.session_id = o.session_id',
  'AND s.occurrence_id = o.occurrence_id',
  'ORDER BY s.completed_at_utc, s.set_id',
  ')))) AS item_json',
  'FROM local_workout_occurrences AS o',
  'WHERE o.subject = ? AND o.session_id = ?',
  'ORDER BY o.actual_order, o.occurrence_id )',
].join(' ');

function subjectOf(access: LocalSubjectAccess): string {
  const value = access.currentAuthenticatedSubject();
  if (!value || !UUID.test(value)) {
    throw new LocalWorkoutError('notAuthenticated');
  }
  return value.toLowerCase();
}

function requiredId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function validSet(value: unknown): value is ActiveSetSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const s = value as Record<string, unknown>;
  if (
    !requiredId(s.set_id) ||
    !['WARMUP', 'WORKING'].includes(String(s.set_role)) ||
    !['reps', 'time', 'distance'].includes(String(s.measurement_type)) ||
    typeof s.completed_at_utc !== 'string' ||
    !Number.isFinite(Date.parse(s.completed_at_utc))
  ) return false;

  const reps = s.measurement_type === 'reps';
  const time = s.measurement_type === 'time';
  const distance = s.measurement_type === 'distance';
  if (
    (reps && (!Number.isSafeInteger(s.reps) || (s.reps as number) <= 0)) ||
    (time && (!Number.isSafeInteger(s.duration_seconds) ||
      (s.duration_seconds as number) <= 0)) ||
    (distance && (typeof s.distance_decimal !== 'string' ||
      !['m', 'km', 'mi'].includes(String(s.distance_unit)))) ||
    (!reps && s.reps !== null) ||
    (!time && s.duration_seconds !== null) ||
    (!distance && (s.distance_decimal !== null || s.distance_unit !== null))
  ) return false;
  if (
    (s.load_decimal === null) !== (s.load_unit === null) ||
    (s.load_decimal !== null &&
      (typeof s.load_decimal !== 'string' ||
        !['kg', 'lb'].includes(String(s.load_unit))))
  ) return false;
  return true;
}

function decode(value: unknown): ActiveExerciseSummary[] {
  if (!Array.isArray(value)) throw new LocalWorkoutError('corruptLocalData');
  const occurrences = new Set<string>();
  const setIds = new Set<string>();
  const orders = new Set<number>();
  let lastOrder = -1;
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new LocalWorkoutError('corruptLocalData');
    }
    const entry = raw as Record<string, unknown>;
    if (
      !requiredId(entry.occurrence_id) ||
      !requiredId(entry.canonical_exercise_id) ||
      !Number.isSafeInteger(entry.actual_order) ||
      (entry.actual_order as number) < 0 ||
      entry.agenda_item_id !== null ||
      !Array.isArray(entry.sets) ||
      entry.sets.length === 0 ||
      occurrences.has(entry.occurrence_id) ||
      orders.has(entry.actual_order as number) ||
      (entry.actual_order as number) <= lastOrder
    ) throw new LocalWorkoutError('corruptLocalData');
    lastOrder = entry.actual_order as number;
    occurrences.add(entry.occurrence_id);
    orders.add(lastOrder);
    for (const row of entry.sets) {
      if (!validSet(row) || setIds.has(row.set_id)) {
        throw new LocalWorkoutError('corruptLocalData');
      }
      setIds.add(row.set_id);
    }
  }
  return value as ActiveExerciseSummary[];
}

/** Resolve the active workout after app restart without mutating anything. */
export async function readActiveFreeWorkoutOverview(
  db: SqliteWorkoutPort,
  access: LocalSubjectAccess,
): Promise<ActiveFreeWorkoutOverview | null> {
  const subject = subjectOf(access);
  const session = await getActiveLocalWorkout(db, access);
  if (subjectOf(access) !== subject) {
    throw new LocalWorkoutError('notAuthenticated');
  }
  if (!session) return null;
  if (session.subject !== subject || session.lifecycle_state !== 'active') {
    throw new LocalWorkoutError('corruptLocalData');
  }
  const data = await db.getFirstAsync<{ items_json: string }>(
    ACTIVE_WORKOUT_OVERVIEW_SQL,
    subject,
    session.session_id,
  );
  if (subjectOf(access) !== subject) {
    throw new LocalWorkoutError('notAuthenticated');
  }
  let raw: unknown;
  try {
    if (typeof data?.items_json !== 'string') throw new Error('Missing SQLite JSON');
    raw = JSON.parse(data.items_json);
  } catch {
    throw new LocalWorkoutError('corruptLocalData');
  }
  const exercises = decode(raw);
  const all = exercises.flatMap((exercise) => exercise.sets);
  const workingSets = all.filter((set) => set.set_role === 'WORKING').length;
  if (subjectOf(access) !== subject) {
    throw new LocalWorkoutError('notAuthenticated');
  }
  return { session, exercises, totalSets: all.length, workingSets };
}
