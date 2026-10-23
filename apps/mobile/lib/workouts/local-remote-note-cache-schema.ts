/** V8 -> V9: separate, owner-scoped immutable cache of remote note events.
 * Remote notes may refer to workouts whose performed ledger has not been
 * materialized on this device; never FK to a locally missing occurrence.
 */
import type { SqliteWorkoutPort } from './local-schema';

export const LOCAL_REMOTE_NOTE_CACHE_SCHEMA_VERSION = 9;
export const LOCAL_WORKOUT_V9_MIGRATION_SQL = `
BEGIN IMMEDIATE;

CREATE TABLE local_remote_exercise_notes (
  subject TEXT NOT NULL,
  note_event_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  occurrence_id TEXT NOT NULL,
  canonical_exercise_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  created_at_utc TEXT NOT NULL,
  PRIMARY KEY (subject, note_event_id)
);

CREATE INDEX local_remote_notes_by_exercise
  ON local_remote_exercise_notes (
    subject, canonical_exercise_id, created_at_utc, note_event_id
  );

CREATE INDEX local_remote_notes_by_session
  ON local_remote_exercise_notes (
    subject, session_id, created_at_utc, note_event_id
  );
`;

export async function migrateWorkoutSchemaV8ToV9(
  db: SqliteWorkoutPort,
): Promise<void> {
  try {
    await db.execAsync(LOCAL_WORKOUT_V9_MIGRATION_SQL);
    const violation = await db.getFirstAsync<{ table: string }>(
      'PRAGMA foreign_key_check',
    );
    if (violation) throw new Error('M3 remote notes cache FK failure');
    await db.execAsync('PRAGMA user_version = 9; COMMIT;');
  } catch (error) {
    try {
      await db.execAsync('ROLLBACK;');
    } catch {
      /* already rolled back */
    }
    throw error;
  }
}
