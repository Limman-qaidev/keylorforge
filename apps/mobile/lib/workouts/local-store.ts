/**
 * M3 local Free Workout transaction boundary.
 *
 * This module has no server calls. A local start is durable only after the
 * SQLite session and corresponding immutable START_SESSION outbox item commit
 * in one exclusive transaction. Remote acknowledgement is a separate step.
 */
import type { SqliteWorkoutPort } from './local-schema';

export type LocalSubjectAccess = {
  /** Must reflect the currently authenticated subject, never a cached token. */
  currentAuthenticatedSubject: () => string | null;
};

export type LocalStartWorkoutInput = {
  sessionId: string;
  mutationId: string;
  startedAtUtc: string;
  timeZone: string;
  utcOffsetMinutes: number;
  localDate: string;
};

export type LocalWorkoutSession = {
  subject: string;
  session_id: string;
  lifecycle_state: 'active' | 'completed' | 'cancelled';
  origin: 'free';
  started_at_utc: string;
  time_zone: string;
  utc_offset_minutes: number;
  local_date: string;
  original_agenda_json: string;
  agenda_revision: number;
};

export type LocalOutboxItem = {
  subject: string;
  mutation_id: string;
  session_id: string;
  mutation_kind: 'START_SESSION';
  protocol_version: 1;
  payload_json: string;
  delivery_state: string;
  created_at_utc: string;
};

export class LocalWorkoutError extends Error {
  constructor(
    public readonly code:
      | 'notAuthenticated'
      | 'invalidInput'
      | 'activeSessionExists'
      | 'mutationConflict'
      | 'sessionIdConflict'
      | 'corruptLocalData',
  ) {
    super(code);
    this.name = 'LocalWorkoutError';
  }
}

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function activeSubject(access: LocalSubjectAccess): string {
  const subject = access.currentAuthenticatedSubject();
  if (!subject || !uuid.test(subject)) {
    throw new LocalWorkoutError('notAuthenticated');
  }
  return subject.toLowerCase();
}

/**
 * The local calendar day and UTC offset are derived from the SAME instant and
 * IANA timezone as the server, not trusted merely because they look valid.
 * Deriving offset with formatToParts supports DST and fractional-hour zones.
 */
function validateInput(input: LocalStartWorkoutInput): void {
  if (!uuid.test(input.sessionId) || !uuid.test(input.mutationId)) {
    throw new LocalWorkoutError('invalidInput');
  }
  const parsed = new Date(input.startedAtUtc);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString() !== input.startedAtUtc ||
    !Number.isInteger(input.utcOffsetMinutes) ||
    Math.abs(input.utcOffsetMinutes) > 840 ||
    !input.timeZone ||
    input.timeZone.length > 64
  ) {
    throw new LocalWorkoutError('invalidInput');
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: input.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const values = Object.fromEntries(
      formatter.formatToParts(parsed).map((part) => [part.type, part.value]),
    );
    const year = Number(values.year);
    const month = Number(values.month);
    const date = Number(values.day);
    const hour = Number(values.hour);
    const minute = Number(values.minute);
    const second = Number(values.second);
    if (![year, month, date, hour, minute, second].every(Number.isInteger)) {
      throw new LocalWorkoutError('invalidInput');
    }
    const actualDate = [
      String(year).padStart(4, '0'),
      String(month).padStart(2, '0'),
      String(date).padStart(2, '0'),
    ].join('-');
    const utcSecond = Date.UTC(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth(),
      parsed.getUTCDate(),
      parsed.getUTCHours(),
      parsed.getUTCMinutes(),
      parsed.getUTCSeconds(),
    );
    const localSecond = Date.UTC(year, month - 1, date, hour, minute, second);
    const offsetMinutes = Math.floor((localSecond - utcSecond) / 60_000);
    if (
      actualDate !== input.localDate ||
      offsetMinutes !== input.utcOffsetMinutes
    ) {
      throw new LocalWorkoutError('invalidInput');
    }
  } catch {
    // An unknown IANA timezone or unavailable ICU timezone data must not
    // create an unsynchronizable "successful" local workout.
    throw new LocalWorkoutError('invalidInput');
  }
}

function startPayload(input: LocalStartWorkoutInput): string {
  // Stable property order is deliberate: the exact mutation payload is immutable
  // and a repeated mutation ID with different intent is rejected locally.
  return JSON.stringify({
    protocol_version: 1,
    session_id: input.sessionId,
    mutation_id: input.mutationId,
    started_at: input.startedAtUtc,
    time_zone: input.timeZone,
  });
}

export async function startLocalFreeWorkout(
  db: SqliteWorkoutPort,
  access: LocalSubjectAccess,
  input: LocalStartWorkoutInput,
): Promise<LocalWorkoutSession> {
  const subject = activeSubject(access);
  const normalized = {
    ...input,
    sessionId: normalized.sessionId.toLowerCase(),
    mutationId: normalized.mutationId.toLowerCase(),
  };
  validateInput(normalized);
  const payload = startPayload(normalized);
  let started: LocalWorkoutSession | null = null;

  await db.withExclusiveTransactionAsync(async (tx) => {
    // Check again inside the transaction: a sign-out/account switch must
    // cancel, not commit, an in-flight mutation from an obsolete identity.
    if (activeSubject(access) !== subject) {
      throw new LocalWorkoutError('notAuthenticated');
    }
    const duplicate = await tx.getFirstAsync<LocalOutboxItem>(
      'SELECT * FROM local_workout_outbox WHERE subject = ? AND mutation_id = ?',
      subject,
      normalized.mutationId,
    );
    if (duplicate) {
      if (
        duplicate.payload_json !== payload ||
        duplicate.session_id !== normalized.sessionId
      ) {
        throw new LocalWorkoutError('mutationConflict');
      }
      started = await tx.getFirstAsync<LocalWorkoutSession>(
        'SELECT * FROM local_workout_sessions WHERE subject = ? AND session_id = ?',
        subject,
        normalized.sessionId,
      );
      if (!started) {
        throw new LocalWorkoutError('corruptLocalData');
      }
      if (activeSubject(access) !== subject) {
        throw new LocalWorkoutError('notAuthenticated');
      }
      return;
    }
    const sameId = await tx.getFirstAsync<LocalWorkoutSession>(
      'SELECT * FROM local_workout_sessions WHERE session_id = ?',
      normalized.sessionId,
    );
    if (sameId) {
      throw new LocalWorkoutError('sessionIdConflict');
    }
    const active = await tx.getFirstAsync<LocalWorkoutSession>(
      "SELECT * FROM local_workout_sessions WHERE subject = ? AND lifecycle_state = 'active'",
      subject,
    );
    if (active) {
      throw new LocalWorkoutError('activeSessionExists');
    }

    await tx.runAsync(
      `INSERT INTO local_workout_sessions
       (subject, session_id, lifecycle_state, origin, started_at_utc, time_zone,
        utc_offset_minutes, local_date, original_agenda_json, agenda_revision)
       VALUES (?, ?, 'active', 'free', ?, ?, ?, ?, ?, 0)`,
      subject,
      normalized.sessionId,
      normalized.startedAtUtc,
      normalized.timeZone,
      normalized.utcOffsetMinutes,
      normalized.localDate,
      JSON.stringify({ schema_version: 1, origin: 'free', items: [] }),
    );
    await tx.runAsync(
      `INSERT INTO local_workout_outbox
       (subject, mutation_id, session_id, mutation_kind, protocol_version,
        payload_json, delivery_state, created_at_utc)
       VALUES (?, ?, ?, 'START_SESSION', 1, ?, 'pending', ?)`,
      subject,
      normalized.mutationId,
      normalized.sessionId,
      payload,
      normalized.startedAtUtc,
    );
    started = await tx.getFirstAsync<LocalWorkoutSession>(
      'SELECT * FROM local_workout_sessions WHERE subject = ? AND session_id = ?',
      subject,
      normalized.sessionId,
    );
    if (!started) {
      throw new LocalWorkoutError('corruptLocalData');
    }
    // This must follow the LAST database await; otherwise a logout triggered
    // during the lookup can leave committed outbox data for an inactive account.
    if (activeSubject(access) !== subject) {
      throw new LocalWorkoutError('notAuthenticated');
    }
  });
  if (activeSubject(access) !== subject) {
    throw new LocalWorkoutError('notAuthenticated');
  }
  if (!started) {
    throw new LocalWorkoutError('corruptLocalData');
  }
  return started;
}

export async function getActiveLocalWorkout(
  db: SqliteWorkoutPort,
  access: LocalSubjectAccess,
): Promise<LocalWorkoutSession | null> {
  const subject = activeSubject(access);
  const result = await db.getFirstAsync<LocalWorkoutSession>(
    "SELECT * FROM local_workout_sessions WHERE subject = ? AND lifecycle_state = 'active'",
    subject,
  );
  if (activeSubject(access) !== subject) {
    throw new LocalWorkoutError('notAuthenticated');
  }
  return result;
}

export async function getPendingLocalWorkoutMutations(
  db: SqliteWorkoutPort,
  access: LocalSubjectAccess,
): Promise<LocalOutboxItem[]> {
  const subject = activeSubject(access);
  // Sync selection must be bound to the currently signed-in subject. The
  // actual worker will validate auth again immediately before transmission.
  const rows = await db.getFirstAsync<LocalOutboxItem>(
    "SELECT * FROM local_workout_outbox WHERE subject = ? AND delivery_state = 'pending' ORDER BY created_at_utc, mutation_id LIMIT 1",
    subject,
  );
  if (activeSubject(access) !== subject) {
    throw new LocalWorkoutError('notAuthenticated');
  }
  return rows ? [rows] : [];
}
