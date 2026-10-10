/**
 * M3 SQLite v4 -> v5: explicit cancellation as a durable lifecycle intent.
 *
 * Rebuild only the outbox CHECK constraint, preserving all earlier rows,
 * payloads, acknowledgement states and causal pointers verbatim. Do not
 * delete performed sets, active sessions, final snapshots or machine records.
 * The cancellation transaction itself is a separate, explicit user action.
 */
import type { SqliteWorkoutPort } from './local-schema';

export const LOCAL_WORKOUT_CANCEL_SCHEMA_VERSION = 5;

export const LOCAL_WORKOUT_V5_MIGRATION_SQL = `
BEGIN IMMEDIATE;

CREATE TABLE local_workout_outbox_v5 (
  subject TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  mutation_kind TEXT NOT NULL
    CHECK (mutation_kind IN ('START_SESSION',
                            'CONFIRM_FIRST_SET_WITH_OCCURRENCE',
                            'CONFIRM_ADDITIONAL_SET',
                            'FINISH_SESSION',
                            'CANCEL_SESSION')),
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
    REFERENCES local_workout_outbox_v5 (subject, mutation_id)
    ON DELETE RESTRICT
);

INSERT INTO local_workout_outbox_v5
  (subject, mutation_id, session_id, mutation_kind, protocol_version,
   payload_json, delivery_state, created_at_utc, depends_on_mutation_id)
SELECT subject, mutation_id, session_id, mutation_kind, protocol_version,
       payload_json, delivery_state, created_at_utc, depends_on_mutation_id
FROM local_workout_outbox;

DROP TABLE local_workout_outbox;
ALTER TABLE local_workout_outbox_v5 RENAME TO local_workout_outbox;

CREATE INDEX local_workout_outbox_pending
  ON local_workout_outbox (subject, delivery_state, created_at_utc);

CREATE TABLE local_workout_cancellations (
  subject TEXT NOT NULL,
  session_id TEXT NOT NULL,
  cancel_mutation_id TEXT NOT NULL,
  cancelled_at_utc TEXT NOT NULL,
  prior_confirmed_sets INTEGER NOT NULL CHECK (prior_confirmed_sets >= 0),
  PRIMARY KEY (subject, session_id),
  UNIQUE (subject, cancel_mutation_id),
  FOREIGN KEY (subject, session_id)
    REFERENCES local_workout_sessions (subject, session_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (subject, cancel_mutation_id)
    REFERENCES local_workout_outbox (subject, mutation_id)
    ON DELETE RESTRICT
);
`;

/** Invoked only for an already-validated v4 database. */
export async function migrateWorkoutSchemaV4ToV5(
  db: SqliteWorkoutPort,
): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await db.execAsync(LOCAL_WORKOUT_V5_MIGRATION_SQL);
    const violation = await db.getFirstAsync<{ table: string }>(
      'PRAGMA foreign_key_check',
    );
    if (violation) {
      throw new Error('M3 SQLite v5 cancel migration FK integrity failure.');
    }
    await db.execAsync('PRAGMA user_version = 5; COMMIT;');
  } catch (error) {
    try {
      await db.execAsync('ROLLBACK;');
    } catch {
      // The interrupted transaction was already rolled back.
    }
    throw error;
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
}
