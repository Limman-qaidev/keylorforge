/**
 * M3 SQLite v1 -> v2, additive performed-work history.
 *
 * The v1 outbox can hold only START_SESSION by CHECK constraint, so it must be
 * rebuilt to keep one causally ordered queue for confirmed-set mutations.
 * All old START rows (including pending work) and their dependencies survive.
 *
 * IMPORTANT: this migration runs with foreign keys temporarily disabled
 * because SQLite cannot DROP a self-referenced table while enforcing its FKs.
 * The schema and historical rows are retained, never dropped on app logout.
 */
import type { SqliteWorkoutPort } from './local-schema';

export const LOCAL_WORKOUT_PERFORMED_SCHEMA_VERSION = 2;

export const LOCAL_WORKOUT_V2_MIGRATION_SQL = `
BEGIN IMMEDIATE;

CREATE TABLE local_workout_outbox_v2 (
  subject TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  mutation_kind TEXT NOT NULL
    CHECK (mutation_kind IN ('START_SESSION',
                            'CONFIRM_FIRST_SET_WITH_OCCURRENCE',
                            'CONFIRM_ADDITIONAL_SET')),
  protocol_version INTEGER NOT NULL CHECK (protocol_version = 1),
  payload_json TEXT NOT NULL,
  delivery_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_state IN ('pending', 'sending', 'acknowledged', 'blocked',
                             'conflict', 'terminal_error')),
  created_at_utc TEXT NOT NULL,
  depends_on_mutation_id TEXT,
  PRIMARY KEY (subject, mutation_id),
  FOREIGN KEY (subject, session_id)
    REFERENCES local_workout_sessions (subject, session_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (subject, depends_on_mutation_id)
    REFERENCES local_workout_outbox_v2 (subject, mutation_id)
    ON DELETE RESTRICT
);

INSERT INTO local_workout_outbox_v2
  (subject, mutation_id, session_id, mutation_kind, protocol_version,
   payload_json, delivery_state, created_at_utc, depends_on_mutation_id)
SELECT subject, mutation_id, session_id, mutation_kind, protocol_version,
       payload_json, delivery_state, created_at_utc, depends_on_mutation_id
FROM local_workout_outbox;

DROP TABLE local_workout_outbox;
ALTER TABLE local_workout_outbox_v2 RENAME TO local_workout_outbox;

CREATE INDEX local_workout_outbox_pending
  ON local_workout_outbox (subject, delivery_state, created_at_utc);

CREATE TABLE local_workout_occurrences (
  subject TEXT NOT NULL,
  session_id TEXT NOT NULL,
  occurrence_id TEXT NOT NULL,
  canonical_exercise_id TEXT NOT NULL,
  agenda_item_id TEXT,
  actual_order INTEGER NOT NULL CHECK (actual_order >= 0),
  first_set_id TEXT NOT NULL,
  PRIMARY KEY (subject, session_id, occurrence_id),
  UNIQUE (subject, occurrence_id),
  UNIQUE (subject, first_set_id),
  FOREIGN KEY (subject, session_id)
    REFERENCES local_workout_sessions (subject, session_id)
    ON DELETE RESTRICT
);

CREATE TABLE local_workout_sets (
  subject TEXT NOT NULL,
  session_id TEXT NOT NULL,
  set_id TEXT NOT NULL,
  occurrence_id TEXT NOT NULL,
  set_role TEXT NOT NULL CHECK (set_role IN ('WARMUP', 'WORKING')),
  measurement_type TEXT NOT NULL CHECK (measurement_type IN ('reps', 'time', 'distance')),
  reps INTEGER CHECK (reps > 0),
  duration_seconds INTEGER CHECK (duration_seconds > 0),
  distance_decimal TEXT,
  distance_unit TEXT CHECK (distance_unit IN ('m', 'km', 'mi')),
  load_decimal TEXT,
  load_unit TEXT CHECK (load_unit IN ('kg', 'lb')),
  load_entry_semantics TEXT,
  machine_profile_id TEXT,
  machine_configuration_id TEXT,
  machine_snapshot_json TEXT,
  target_at_confirmation_json TEXT,
  completed_at_utc TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  PRIMARY KEY (subject, set_id),
  UNIQUE (subject, mutation_id),
  FOREIGN KEY (subject, session_id, occurrence_id)
    REFERENCES local_workout_occurrences (subject, session_id, occurrence_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (subject, mutation_id)
    REFERENCES local_workout_outbox (subject, mutation_id)
    ON DELETE RESTRICT,
  CHECK (
    (measurement_type = 'reps' AND reps IS NOT NULL
      AND duration_seconds IS NULL AND distance_decimal IS NULL
      AND distance_unit IS NULL)
    OR (measurement_type = 'time' AND reps IS NULL
      AND duration_seconds IS NOT NULL AND distance_decimal IS NULL
      AND distance_unit IS NULL)
    OR (measurement_type = 'distance' AND reps IS NULL
      AND duration_seconds IS NULL AND distance_decimal IS NOT NULL
      AND distance_unit IS NOT NULL)
  ),
  CHECK ((load_decimal IS NULL AND load_unit IS NULL
          AND load_entry_semantics IS NULL)
      OR (load_decimal IS NOT NULL AND load_unit IS NOT NULL
          AND load_entry_semantics IS NOT NULL))
);

CREATE INDEX local_workout_sets_by_occurrence
  ON local_workout_sets (subject, session_id, occurrence_id, completed_at_utc);

`;

/** Called only when the connection has verified PRAGMA user_version = 1. */
export async function migrateWorkoutSchemaV1ToV2(
  db: SqliteWorkoutPort,
): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    // All table copies and version bump succeed or roll back as one.
    await db.execAsync(LOCAL_WORKOUT_V2_MIGRATION_SQL);
    // Check FK integrity BEFORE the transaction commits; a bad migration
    // must not commit corrupted data or advance the schema version.
    const violation = await db.getFirstAsync<{ table: string }>(
      'PRAGMA foreign_key_check',
    );
    if (violation) {
      throw new Error('M3 SQLite migration failed foreign key integrity check.');
    }
    await db.execAsync('PRAGMA user_version = 2; COMMIT;');
  } catch (error) {
    // Best-effort rollback if an SQLite statement already aborted the transaction.
    try {
      await db.execAsync('ROLLBACK;');
    } catch {
      // The transaction already ended or SQLite closed it automatically.
    }
    throw error;
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
}
