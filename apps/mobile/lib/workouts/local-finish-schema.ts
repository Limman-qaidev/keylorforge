/**
 * M3 SQLite v3 -> v4: non-destructive groundwork for explicit FINISH_SESSION.
 *
 * This migration ONLY extends the local schema. It must never turn an active
 * session into completed, manufacture a final agenda, or enqueue a finish.
 * Future domain code must prove qualifying performed work before doing so.
 *
 * Rebuilding the workout outbox is necessary because v2 constrains the
 * accepted mutation kinds. Copy ALL historical rows, statuses, payloads
 * and causal pointers verbatim; machine outbox is completely independent.
 */
import type { SqliteWorkoutPort } from './local-schema';

export const LOCAL_WORKOUT_FINISH_SCHEMA_VERSION = 4;

export const LOCAL_WORKOUT_V4_MIGRATION_SQL = `
BEGIN IMMEDIATE;

CREATE TABLE local_workout_outbox_v4 (
  subject TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  mutation_kind TEXT NOT NULL
    CHECK (mutation_kind IN ('START_SESSION',
                            'CONFIRM_FIRST_SET_WITH_OCCURRENCE',
                            'CONFIRM_ADDITIONAL_SET',
                            'FINISH_SESSION')),
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
    REFERENCES local_workout_outbox_v4 (subject, mutation_id)
    ON DELETE RESTRICT
);

INSERT INTO local_workout_outbox_v4
  (subject, mutation_id, session_id, mutation_kind, protocol_version,
   payload_json, delivery_state, created_at_utc, depends_on_mutation_id)
SELECT subject, mutation_id, session_id, mutation_kind, protocol_version,
       payload_json, delivery_state, created_at_utc, depends_on_mutation_id
FROM local_workout_outbox;

DROP TABLE local_workout_outbox;
ALTER TABLE local_workout_outbox_v4 RENAME TO local_workout_outbox;

CREATE INDEX local_workout_outbox_pending
  ON local_workout_outbox (subject, delivery_state, created_at_utc);

CREATE TABLE local_workout_final_snapshots (
  subject TEXT NOT NULL,
  session_id TEXT NOT NULL,
  finish_mutation_id TEXT NOT NULL,
  completion_snapshot_id TEXT NOT NULL,
  finished_at_utc TEXT NOT NULL,
  final_agenda_json TEXT NOT NULL,
  PRIMARY KEY (subject, session_id),
  UNIQUE (subject, finish_mutation_id),
  UNIQUE (subject, completion_snapshot_id),
  FOREIGN KEY (subject, session_id)
    REFERENCES local_workout_sessions (subject, session_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (subject, finish_mutation_id)
    REFERENCES local_workout_outbox (subject, mutation_id)
    ON DELETE RESTRICT
);
`;

/**
 * Only valid after fully applied v3. SQLite requires FK enforcement disabled
 * outside a transaction while replacing the existing self-referenced outbox.
 * The schema, copied rows and version bump commit atomically or not at all.
 */
export async function migrateWorkoutSchemaV3ToV4(
  db: SqliteWorkoutPort,
): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await db.execAsync(LOCAL_WORKOUT_V4_MIGRATION_SQL);
    const violation = await db.getFirstAsync<{ table: string }>(
      'PRAGMA foreign_key_check',
    );
    if (violation) {
      throw new Error('M3 SQLite v4 finish migration FK integrity failure.');
    }
    await db.execAsync('PRAGMA user_version = 4; COMMIT;');
  } catch (error) {
    try {
      await db.execAsync('ROLLBACK;');
    } catch {
      // SQLite has already aborted/closed the transaction.
    }
    throw error;
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
}
