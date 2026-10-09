/** SQLite v5→v6: owner-scoped remote-origin history, strictly not a local workout. */
import type { SqliteWorkoutPort } from './local-schema';

export const LOCAL_WORKOUT_REMOTE_HISTORY_SCHEMA_VERSION = 6;

export const LOCAL_WORKOUT_V6_MIGRATION_SQL = `
BEGIN IMMEDIATE;

CREATE TABLE local_remote_workout_history (
  subject TEXT NOT NULL,
  session_id TEXT NOT NULL,
  completion_snapshot_id TEXT NOT NULL,
  finish_mutation_id TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'remote_complete'
    CHECK (origin = 'remote_complete'),
  finished_at_utc TEXT NOT NULL,
  observed_at_utc TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL CHECK (occurrence_count > 0),
  total_sets INTEGER NOT NULL CHECK (total_sets > 0),
  working_sets INTEGER NOT NULL CHECK (working_sets BETWEEN 1 AND total_sets),
  detail_json TEXT NOT NULL CHECK (json_valid(detail_json)),
  PRIMARY KEY (subject, session_id)
);

CREATE INDEX local_remote_workout_history_date
  ON local_remote_workout_history (subject, finished_at_utc DESC, session_id DESC);
`;

export async function migrateWorkoutSchemaV5ToV6(
  db: SqliteWorkoutPort,
): Promise<void> {
  try {
    await db.execAsync(LOCAL_WORKOUT_V6_MIGRATION_SQL);
    const violation = await db.getFirstAsync<{ table: string }>(
      'PRAGMA foreign_key_check',
    );
    if (violation) {
      throw new Error('M3 SQLite v6 remote-history FK integrity failure.');
    }
    await db.execAsync('PRAGMA user_version = 6; COMMIT;');
  } catch (error) {
    try {
      await db.execAsync('ROLLBACK;');
    } catch {
      // The failed transaction may already be rolled back.
    }
    throw error;
  }
}
