/**
 * M3 SQLite schema v1. This is a platform-neutral migration description,
 * not an additional storage backend. The Expo SQLite adapter is wired later.
 *
 * All user-owned rows include the authenticated Supabase subject. Keeping an
 * account's unsynced outbox during ordinary logout is intentional: access is
 * blocked by the caller's active-subject capability, not by deleting history.
 */
export const LOCAL_WORKOUT_SCHEMA_VERSION = 1;

export interface SqliteQueryPort {
  getFirstAsync<T>(sql: string, ...params: (string | number | null)[]): Promise<T | null>;
  runAsync(sql: string, ...params: (string | number | null)[]): Promise<unknown>;
}

export interface SqliteWorkoutPort extends SqliteQueryPort {
  execAsync(sql: string): Promise<void>;
  withExclusiveTransactionAsync(task: (tx: SqliteQueryPort) => Promise<void>): Promise<void>;
}

export const LOCAL_WORKOUT_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS local_workout_sessions (
  subject TEXT NOT NULL,
  session_id TEXT NOT NULL,
  lifecycle_state TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle_state IN ('active', 'completed', 'cancelled')),
  origin TEXT NOT NULL CHECK (origin = 'free'),
  started_at_utc TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  utc_offset_minutes INTEGER NOT NULL
    CHECK (utc_offset_minutes BETWEEN -840 AND 840),
  local_date TEXT NOT NULL,
  original_agenda_json TEXT NOT NULL,
  agenda_revision INTEGER NOT NULL DEFAULT 0 CHECK (agenda_revision >= 0),
  PRIMARY KEY (subject, session_id),
  UNIQUE (session_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS local_one_active_workout_per_subject
  ON local_workout_sessions (subject) WHERE lifecycle_state = 'active';

CREATE TABLE IF NOT EXISTS local_workout_outbox (
  subject TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  mutation_kind TEXT NOT NULL CHECK (mutation_kind = 'START_SESSION'),
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
    REFERENCES local_workout_outbox (subject, mutation_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS local_workout_outbox_pending
  ON local_workout_outbox (subject, delivery_state, created_at_utc);
`;

export async function initializeLocalWorkoutSchema(db: SqliteWorkoutPort): Promise<void> {
  await db.execAsync(LOCAL_WORKOUT_SCHEMA_SQL);
}
