/**
 * Latest actual working set for one canonical exercise across completed workouts.
 * Local-only read: no network, no fake targets, no mutation of performed sets.
 */
import type { SqliteWorkoutPort } from './local-schema';
import type { LocalSubjectAccess } from './local-store';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LastExercisePerformance = {
  session_id: string;
  completed_at_utc: string;
  measurement_type: 'reps' | 'time' | 'distance';
  reps: number | null;
  duration_seconds: number | null;
  distance_decimal: string | null;
  distance_unit: 'm' | 'km' | 'mi' | null;
  load_decimal: string | null;
  load_unit: 'kg' | 'lb' | null;
};

export const LAST_EXERCISE_PERFORMANCE_SQL = [
  'SELECT s.session_id, s.completed_at_utc, s.measurement_type,',
  's.reps, s.duration_seconds, s.distance_decimal, s.distance_unit,',
  's.load_decimal, s.load_unit',
  'FROM local_workout_sets AS s',
  'JOIN local_workout_occurrences AS o',
  'ON o.subject = s.subject AND o.session_id = s.session_id',
  'AND o.occurrence_id = s.occurrence_id',
  'JOIN local_workout_sessions AS w',
  'ON w.subject = s.subject AND w.session_id = s.session_id',
  'WHERE s.subject = ? AND o.canonical_exercise_id = ?',
  "AND s.set_role = 'WORKING' AND w.lifecycle_state = 'completed'",
  'ORDER BY s.completed_at_utc DESC, s.set_id DESC LIMIT 1',
].join(' ');

function owner(access: LocalSubjectAccess): string {
  const subject = access.currentAuthenticatedSubject();
  if (!subject || !UUID.test(subject)) {
    throw new Error('notAuthenticated');
  }
  return subject.toLowerCase();
}

function valid(value: LastExercisePerformance): boolean {
  if (
    !UUID.test(value.session_id) ||
    !Number.isFinite(Date.parse(value.completed_at_utc)) ||
    !['reps', 'time', 'distance'].includes(value.measurement_type) ||
    (value.load_decimal === null) !== (value.load_unit === null)
  )
    return false;
  if (value.measurement_type === 'reps') {
    return Number.isSafeInteger(value.reps) && (value.reps ?? 0) > 0;
  }
  if (value.measurement_type === 'time') {
    return (
      Number.isSafeInteger(value.duration_seconds) &&
      (value.duration_seconds ?? 0) > 0
    );
  }
  return (
    value.distance_decimal !== null &&
    ['m', 'km', 'mi'].includes(String(value.distance_unit))
  );
}

export async function readLastCompletedExercisePerformance(
  db: SqliteWorkoutPort,
  access: LocalSubjectAccess,
  canonicalExerciseId: string,
): Promise<LastExercisePerformance | null> {
  const subject = owner(access);
  if (!UUID.test(canonicalExerciseId)) throw new Error('invalidExerciseId');
  const row = await db.getFirstAsync<LastExercisePerformance>(
    LAST_EXERCISE_PERFORMANCE_SQL,
    subject,
    canonicalExerciseId.toLowerCase(),
  );
  if (owner(access) !== subject) throw new Error('notAuthenticated');
  if (row === null) return null;
  if (!valid(row)) throw new Error('corruptLocalHistory');
  return row;
}
