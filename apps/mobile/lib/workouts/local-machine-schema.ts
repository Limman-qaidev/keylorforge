/**
 * M3 SQLite v2 -> v3: additive, owner-partitioned offline machine foundation.
 *
 * Machine Profiles can be created without a workout session. In v2, workout
 * outbox entries are session-owned and require session_id; do not shoehorn
 * machine creates into that queue, nor assign an invented workout identity.
 *
 * v2 sessions/sets/outbox and their original machine snapshots stay untouched.
 * Later delivery must ACK machine creates before machine-bound performed sets.
 */
import type { SqliteWorkoutPort } from './local-schema';

export const LOCAL_WORKOUT_MACHINE_SCHEMA_VERSION = 3;

export const LOCAL_WORKOUT_V3_MIGRATION_SQL = `
BEGIN IMMEDIATE;

CREATE TABLE local_machine_outbox (
  subject TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  mutation_kind TEXT NOT NULL
    CHECK (mutation_kind IN ('CREATE_MACHINE_PROFILE',
                            'CREATE_MACHINE_CONFIGURATION')),
  profile_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  protocol_version INTEGER NOT NULL CHECK (protocol_version = 1),
  payload_json TEXT NOT NULL,
  delivery_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_state IN ('pending', 'sending', 'acknowledged', 'blocked',
                             'conflict', 'terminal_error')),
  created_at_utc TEXT NOT NULL,
  depends_on_mutation_id TEXT,
  PRIMARY KEY (subject, mutation_id),
  UNIQUE (subject, entity_id),
  CHECK (
    (mutation_kind = 'CREATE_MACHINE_PROFILE'
       AND depends_on_mutation_id IS NULL AND entity_id = profile_id)
    OR
    (mutation_kind = 'CREATE_MACHINE_CONFIGURATION'
       AND depends_on_mutation_id IS NOT NULL)
  ),
  FOREIGN KEY (subject, depends_on_mutation_id)
    REFERENCES local_machine_outbox (subject, mutation_id)
    ON DELETE RESTRICT
);

CREATE INDEX local_machine_outbox_pending
  ON local_machine_outbox (subject, delivery_state, created_at_utc);

CREATE TABLE local_machine_profiles (
  subject TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  nickname TEXT NOT NULL CHECK (length(trim(nickname)) > 0),
  catalog_equipment_id TEXT,
  manufacturer TEXT,
  model_name TEXT,
  native_load_unit TEXT CHECK (native_load_unit IN ('kg','lb')),
  load_entry_semantics TEXT
    CHECK (load_entry_semantics IN
      ('total','per_implement','machine_display','assistance')),
  technical_metadata_json TEXT NOT NULL,
  metadata_source TEXT NOT NULL CHECK (metadata_source = 'user_entered'),
  created_at_utc TEXT NOT NULL,
  create_mutation_id TEXT NOT NULL,
  PRIMARY KEY (subject, profile_id),
  UNIQUE (profile_id),
  UNIQUE (subject, create_mutation_id),
  FOREIGN KEY (subject, create_mutation_id)
    REFERENCES local_machine_outbox (subject, mutation_id)
    ON DELETE RESTRICT
);

CREATE TABLE local_machine_configurations (
  subject TEXT NOT NULL,
  configuration_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  label TEXT NOT NULL CHECK (length(trim(label)) > 0),
  material_setup_json TEXT NOT NULL,
  metadata_source TEXT NOT NULL CHECK (metadata_source = 'user_entered'),
  created_at_utc TEXT NOT NULL,
  create_mutation_id TEXT NOT NULL,
  PRIMARY KEY (subject, configuration_id),
  UNIQUE (configuration_id),
  UNIQUE (subject, create_mutation_id),
  FOREIGN KEY (subject, profile_id)
    REFERENCES local_machine_profiles (subject, profile_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (subject, create_mutation_id)
    REFERENCES local_machine_outbox (subject, mutation_id)
    ON DELETE RESTRICT
);

CREATE INDEX local_machine_configurations_profile
  ON local_machine_configurations (subject, profile_id);
`;

/**
 * A completed v2 database is the only supported source.
 * Version is advanced in the same SQLite transaction as all three tables.
 * Retried after a crash, migration rolls back completely or does not run.
 */
export async function migrateWorkoutSchemaV2ToV3(
  db: SqliteWorkoutPort,
): Promise<void> {
  try {
    await db.execAsync(LOCAL_WORKOUT_V3_MIGRATION_SQL);
    const violation = await db.getFirstAsync<{ table: string }>(
      'PRAGMA foreign_key_check',
    );
    if (violation) {
      throw new Error('M3 SQLite v3 machine migration FK integrity failure.');
    }
    await db.execAsync('PRAGMA user_version = 3; COMMIT;');
  } catch (error) {
    try {
      await db.execAsync('ROLLBACK;');
    } catch {
      // SQLite already closed/aborted the transaction.
    }
    throw error;
  }
}
