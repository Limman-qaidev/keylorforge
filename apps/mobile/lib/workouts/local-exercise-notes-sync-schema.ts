/** Non-destructive v7 -> v8 migration: every pre-existing local note
 * becomes a pending event, preserving the UUID and historical text.
 */
import type { SqliteWorkoutPort } from './local-schema';

export const LOCAL_WORKOUT_NOTE_SYNC_SCHEMA_VERSION = 8;
export const LOCAL_WORKOUT_V8_MIGRATION_SQL = `
BEGIN IMMEDIATE;

ALTER TABLE local_exercise_note_events
  ADD COLUMN delivery_state TEXT NOT NULL DEFAULT 'pending'
  CHECK (delivery_state IN ('pending', 'acknowledged', 'conflict'));

CREATE INDEX local_exercise_notes_pending
  ON local_exercise_note_events
  (subject, delivery_state, created_at_utc, note_event_id);
`;

export async function migrateWorkoutSchemaV7ToV8(
  db: SqliteWorkoutPort,
): Promise<void> {
  try {
    await db.execAsync(LOCAL_WORKOUT_V8_MIGRATION_SQL);
    const violation = await db.getFirstAsync<{ table: string }>(
      'PRAGMA foreign_key_check',
    );
    if (violation) throw new Error('M3 notes v8 FK integrity failure');
    await db.execAsync('PRAGMA user_version = 8; COMMIT;');
  } catch (error) {
    try { await db.execAsync('ROLLBACK;'); } catch { /* already rolled back */ }
    throw error;
  }
}
