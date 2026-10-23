/** M3 SQLite v6 -> v7, additive append-only owner-scoped exercise note events.
 * This is a LOCAL QA foundation. Remote delivery requires its own approved
 * mutation protocol and must not be misrepresented as synchronized.
 */
import type { SqliteWorkoutPort } from './local-schema';

export const LOCAL_WORKOUT_NOTES_SCHEMA_VERSION = 7;

export const LOCAL_WORKOUT_V7_MIGRATION_SQL = `
BEGIN IMMEDIATE;

CREATE TABLE local_exercise_note_events (
  subject TEXT NOT NULL,
  session_id TEXT NOT NULL,
  occurrence_id TEXT NOT NULL,
  canonical_exercise_id TEXT NOT NULL,
  note_event_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  created_at_utc TEXT NOT NULL,
  PRIMARY KEY (subject, note_event_id),
  FOREIGN KEY (subject, session_id, occurrence_id)
    REFERENCES local_workout_occurrences (subject, session_id, occurrence_id)
    ON DELETE RESTRICT
);

CREATE INDEX local_exercise_notes_by_occurrence
  ON local_exercise_note_events
  (subject, session_id, occurrence_id, created_at_utc, note_event_id);

CREATE INDEX local_exercise_notes_by_canonical
  ON local_exercise_note_events
  (subject, canonical_exercise_id, created_at_utc, note_event_id);
`;

export async function migrateWorkoutSchemaV6ToV7(
  db: SqliteWorkoutPort,
): Promise<void> {
  try {
    await db.execAsync(LOCAL_WORKOUT_V7_MIGRATION_SQL);
    const violation = await db.getFirstAsync<{ table: string }>(
      'PRAGMA foreign_key_check',
    );
    if (violation) {
      throw new Error('M3 SQLite v7 notes migration FK integrity failure.');
    }
    await db.execAsync('PRAGMA user_version = 7; COMMIT;');
  } catch (error) {
    try {
      await db.execAsync('ROLLBACK;');
    } catch {
      // Transaction already rolled back.
    }
    throw error;
  }
}
