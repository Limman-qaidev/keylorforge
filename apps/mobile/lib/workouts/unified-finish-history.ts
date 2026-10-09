/**
 * M3 combined completed-workout history READ MODEL (local + remote-origin).
 *
 * Local workouts retain their real outbox delivery state. A server-only cached
 * workout is never an acknowledged local FINISH, and a local session/outbox
 * collision always takes precedence without deleting either source.
 * No network access, mutation or automatic import is performed here.
 */
import type { SqliteWorkoutPort } from './local-schema';
import { LocalFinishError } from './local-finish';
import type { LocalSubjectAccess } from './local-store';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_SYNC_STATES = new Set([
  'pending',
  'sending',
  'acknowledged',
  'blocked',
  'conflict',
  'terminal_error',
]);
const MAX_PAGE_SIZE = 50;

/**
 * A single owner-fenced, deterministic SQL page. Any local record or outbox
 * trace suppresses a colliding cached remote read-model row from this view,
 * even if the local session is ACTIVE or CANCELLED. Neither is erased.
 * julianday normalizes offset-aware timestamps for chronological ordering.
 */
export const UNIFIED_FINISHED_HISTORY_SQL = `
SELECT COALESCE(json_group_array(json(item_json)), '[]') AS items_json
FROM (
  SELECT json_object(
    'subject', candidate.subject,
    'origin', candidate.origin,
    'session_id', candidate.session_id,
    'completion_snapshot_id', candidate.completion_snapshot_id,
    'finished_at_utc', candidate.finished_at_utc,
    'total_sets', candidate.total_sets,
    'working_sets', candidate.working_sets,
    'sync_state', candidate.sync_state
  ) AS item_json
  FROM (
    SELECT f.subject, 'local' AS origin, f.session_id,
           f.completion_snapshot_id, f.finished_at_utc,
           (SELECT COUNT(*) FROM local_workout_sets AS s
            WHERE s.subject = f.subject AND s.session_id = f.session_id) AS total_sets,
           (SELECT COUNT(*) FROM local_workout_sets AS s
            WHERE s.subject = f.subject AND s.session_id = f.session_id
              AND s.set_role = 'WORKING') AS working_sets,
           o.delivery_state AS sync_state
    FROM local_workout_final_snapshots AS f
    JOIN local_workout_sessions AS w
      ON w.subject = f.subject AND w.session_id = f.session_id
    JOIN local_workout_outbox AS o
      ON o.subject = f.subject AND o.mutation_id = f.finish_mutation_id
    WHERE f.subject = ? AND w.lifecycle_state = 'completed'
      AND o.mutation_kind = 'FINISH_SESSION'
    UNION ALL
    SELECT r.subject, 'remote_complete' AS origin, r.session_id,
           r.completion_snapshot_id, r.finished_at_utc,
           r.total_sets, r.working_sets, NULL AS sync_state
    FROM local_remote_workout_history AS r
    WHERE r.subject = ?
      AND NOT EXISTS (
        SELECT 1 FROM local_workout_sessions AS l
        WHERE l.subject = r.subject
          AND lower(l.session_id) = lower(r.session_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM local_workout_outbox AS o
        WHERE o.subject = r.subject
          AND lower(o.session_id) = lower(r.session_id)
      )
  ) AS candidate
  ORDER BY julianday(candidate.finished_at_utc) DESC,
           candidate.finished_at_utc DESC, candidate.session_id DESC
  LIMIT ? OFFSET ?
);
`;

export type UnifiedFinishedHistoryEntry = {
  subject: string;
  origin: 'local' | 'remote_complete';
  session_id: string;
  completion_snapshot_id: string;
  finished_at_utc: string;
  total_sets: number;
  working_sets: number;
  /** null for remote-origin cache: NEVER a fabricated local acknowledgement. */
  sync_state:
    | 'pending'
    | 'sending'
    | 'acknowledged'
    | 'blocked'
    | 'conflict'
    | 'terminal_error'
    | null;
};

function subjectOf(access: LocalSubjectAccess): string {
  const subject = access.currentAuthenticatedSubject();
  if (!subject || !UUID.test(subject)) {
    throw new LocalFinishError('notAuthenticated');
  }
  return subject.toLowerCase();
}

function validEntry(value: unknown, subject: string): value is UnifiedFinishedHistoryEntry {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    row.subject === subject &&
    (row.origin === 'local' || row.origin === 'remote_complete') &&
    typeof row.session_id === 'string' &&
    UUID.test(row.session_id) &&
    typeof row.completion_snapshot_id === 'string' &&
    UUID.test(row.completion_snapshot_id) &&
    typeof row.finished_at_utc === 'string' &&
    Number.isFinite(Date.parse(row.finished_at_utc)) &&
    Number.isSafeInteger(row.total_sets) &&
    (row.total_sets as number) > 0 &&
    Number.isSafeInteger(row.working_sets) &&
    (row.working_sets as number) > 0 &&
    (row.working_sets as number) <= (row.total_sets as number) &&
    ((row.origin === 'remote_complete' && row.sync_state === null) ||
      (row.origin === 'local' &&
        typeof row.sync_state === 'string' &&
        LOCAL_SYNC_STATES.has(row.sync_state)))
  );
}

/** Bounded, account-fenced history page; never requests HTTP or writes SQLite. */
export async function listUnifiedFinishedWorkouts(
  db: SqliteWorkoutPort,
  access: LocalSubjectAccess,
  options: { limit?: number; offset?: number } = {},
): Promise<UnifiedFinishedHistoryEntry[]> {
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
  const subject = subjectOf(access);
  const result = await db.getFirstAsync<{ items_json: string }>(
    UNIFIED_FINISHED_HISTORY_SQL,
    subject,
    subject,
    limit,
    offset,
  );
  if (subjectOf(access) !== subject) {
    throw new LocalFinishError('notAuthenticated');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(result?.items_json ?? '');
  } catch {
    throw new LocalFinishError('corruptLocalData');
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length > limit ||
    !parsed.every((entry) => validEntry(entry, subject))
  ) {
    throw new LocalFinishError('corruptLocalData');
  }
  if (subjectOf(access) !== subject) {
    throw new LocalFinishError('notAuthenticated');
  }
  return parsed as UnifiedFinishedHistoryEntry[];
}
