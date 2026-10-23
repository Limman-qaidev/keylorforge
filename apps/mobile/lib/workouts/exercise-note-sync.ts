/** Safe offline-first delivery for immutable exercise-note events.
 * Each attempt sends only a previously confirmed occurrence, validates a
 * committed server receipt, then durably ACKs the same local event.
 */
import { requestApi } from '../api/client';
import type { SqliteWorkoutPort } from './local-schema';
import type { StartSyncAccess } from './start-session-sync';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const inFlight = new WeakSet<SqliteWorkoutPort>();

type PendingNote = {
  subject: string;
  note_event_id: string;
  session_id: string;
  occurrence_id: string;
  canonical_exercise_id: string;
  body: string;
  created_at_utc: string;
  delivery_state: string;
};
type Parent = { canonical_exercise_id: string; delivery_state: string };

export type NoteSyncOutcome =
  | { state: 'idle' | 'inFlight' }
  | { state: 'acknowledged' | 'conflict'; mutationId: string }
  | { state: 'blocked'; reason: 'auth' | 'dependency' | 'localData' | 'rejected' }
  | { state: 'retryable'; reason: 'network' | 'server' | 'invalidResponse' };

function owner(access: StartSyncAccess): string {
  const subject = access.currentAuthenticatedSubject();
  if (!subject || !UUID.test(subject)) throw new Error('notAuthenticated');
  return subject.toLowerCase();
}
function check(access: StartSyncAccess, expected: string): void {
  if (owner(access) !== expected) throw new Error('notAuthenticated');
}
function sameReceipt(payload: unknown, note: PendingNote): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const result = payload as Record<string, unknown>;
  return (
    result.note_event_id === note.note_event_id &&
    result.session_id === note.session_id &&
    result.occurrence_id === note.occurrence_id &&
    result.canonical_exercise_id === note.canonical_exercise_id &&
    result.body === note.body &&
    typeof result.created_at_utc === 'string' &&
    Date.parse(result.created_at_utc) === Date.parse(note.created_at_utc)
  );
}

async function ack(
  db: SqliteWorkoutPort,
  access: StartSyncAccess,
  note: PendingNote,
  state: 'acknowledged' | 'conflict',
): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    check(access, note.subject);
    const current = await tx.getFirstAsync<PendingNote>(
      'SELECT * FROM local_exercise_note_events WHERE subject = ? AND note_event_id = ?',
      note.subject, note.note_event_id,
    );
    check(access, note.subject);
    if (!current ||
      current.body !== note.body ||
      current.created_at_utc !== note.created_at_utc ||
      current.session_id !== note.session_id ||
      current.occurrence_id !== note.occurrence_id ||
      current.canonical_exercise_id !== note.canonical_exercise_id ||
      !['pending', state].includes(current.delivery_state)
    ) throw new Error('corruptLocalData');
    if (current.delivery_state === 'pending') {
      await tx.runAsync(
        "UPDATE local_exercise_note_events SET delivery_state = ? WHERE subject = ? AND note_event_id = ? AND delivery_state = 'pending'",
        state, note.subject, note.note_event_id,
      );
    }
    const checked = await tx.getFirstAsync<PendingNote>(
      'SELECT * FROM local_exercise_note_events WHERE subject = ? AND note_event_id = ?',
      note.subject, note.note_event_id,
    );
    check(access, note.subject);
    if (checked?.delivery_state !== state || checked.body !== note.body) {
      throw new Error('corruptLocalData');
    }
  });
  check(access, note.subject);
}

/** One bounded event per attempt. Keeps unsent data forever on transient failure. */
export async function syncNextPendingExerciseNote(
  db: SqliteWorkoutPort,
  access: StartSyncAccess,
): Promise<NoteSyncOutcome> {
  if (inFlight.has(db)) return { state: 'inFlight' };
  inFlight.add(db);
  try {
    const subject = owner(access);
    const note = await db.getFirstAsync<PendingNote>(
      "SELECT * FROM local_exercise_note_events WHERE subject = ? AND delivery_state = 'pending' ORDER BY created_at_utc, note_event_id LIMIT 1",
      subject,
    );
    check(access, subject);
    if (!note) return { state: 'idle' };
    if (note.subject !== subject || note.delivery_state !== 'pending' ||
        ![note.note_event_id, note.session_id, note.occurrence_id, note.canonical_exercise_id].every((id) => UUID.test(id)) ||
        note.body.length < 1 || note.body.length > 1000 ||
        !Number.isFinite(Date.parse(note.created_at_utc))) {
      return { state: 'blocked', reason: 'localData' };
    }
    // The first set must be ACKed before the server could own this occurrence.
    const parent = await db.getFirstAsync<Parent>(
      `SELECT o.canonical_exercise_id, b.delivery_state
       FROM local_workout_occurrences o
       JOIN local_workout_sets s
         ON s.subject = o.subject AND s.session_id = o.session_id
         AND s.set_id = o.first_set_id
       JOIN local_workout_outbox b
         ON b.subject = s.subject AND b.mutation_id = s.mutation_id
       WHERE o.subject = ? AND o.session_id = ? AND o.occurrence_id = ?`,
      subject, note.session_id, note.occurrence_id,
    );
    check(access, subject);
    if (!parent || parent.canonical_exercise_id !== note.canonical_exercise_id) {
      return { state: 'blocked', reason: 'localData' };
    }
    if (parent.delivery_state !== 'acknowledged') {
      return { state: 'blocked', reason: 'dependency' };
    }
    const credentials = await access.acquireCurrentCredentials();
    check(access, subject);
    if (!credentials || credentials.subject.toLowerCase() !== subject ||
        !credentials.accessToken) return { state: 'blocked', reason: 'auth' };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let response: Response;
    try {
      response = await requestApi(
        `/workout-sessions/${note.session_id}/notes`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            protocol_version: 1,
            note_event_id: note.note_event_id,
            session_id: note.session_id,
            occurrence_id: note.occurrence_id,
            canonical_exercise_id: note.canonical_exercise_id,
            body: note.body,
            created_at_utc: note.created_at_utc,
          }),
          signal: controller.signal,
        },
      );
    } catch {
      return { state: 'retryable', reason: 'network' };
    } finally {
      clearTimeout(timeout);
    }
    check(access, subject);
    if (response.status === 409) {
      await ack(db, access, note, 'conflict');
      return { state: 'conflict', mutationId: note.note_event_id };
    }
    if (response.status === 401 || response.status === 403)
      return { state: 'blocked', reason: 'auth' };
    if (response.status === 404 || response.status === 422)
      return { state: 'blocked', reason: 'rejected' };
    if (response.status !== 201) return { state: 'retryable', reason: 'server' };
    let receipt: unknown;
    try { receipt = await response.json(); } catch {
      return { state: 'retryable', reason: 'invalidResponse' };
    }
    check(access, subject);
    if (!sameReceipt(receipt, note)) {
      return { state: 'retryable', reason: 'invalidResponse' };
    }
    await ack(db, access, note, 'acknowledged');
    return { state: 'acknowledged', mutationId: note.note_event_id };
  } finally {
    inFlight.delete(db);
  }
}
