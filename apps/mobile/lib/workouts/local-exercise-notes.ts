/**
 * Local exercise annotations: immutable, append-only and account-scoped.
 * No remote-sync claim. Independent from performed-set ledger and FINISH.
 */
import type { SqliteWorkoutPort } from './local-schema';
import type { LocalSubjectAccess } from './local-store';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ExerciseNoteEvent = {
  session_id: string;
  occurrence_id: string;
  canonical_exercise_id: string;
  note_event_id: string;
  body: string;
  created_at_utc: string;
};

export type NewExerciseNote = ExerciseNoteEvent;

function requireOwner(access: LocalSubjectAccess): string {
  const subject = access.currentAuthenticatedSubject();
  if (!subject || !UUID.test(subject)) throw new Error('notAuthenticated');
  return subject.toLowerCase();
}

function requireId(value: string): string {
  if (!UUID.test(value)) throw new Error('invalidInput');
  return value.toLowerCase();
}

function validEvent(row: ExerciseNoteEvent): boolean {
  return Boolean(
    UUID.test(row.session_id) &&
    UUID.test(row.occurrence_id) &&
    UUID.test(row.canonical_exercise_id) &&
    UUID.test(row.note_event_id) &&
    typeof row.body === 'string' &&
    row.body.trim() === row.body &&
    row.body.length >= 1 &&
    row.body.length <= 1000 &&
    Number.isFinite(Date.parse(row.created_at_utc)),
  );
}

export async function appendLocalExerciseNote(
  db: SqliteWorkoutPort,
  access: LocalSubjectAccess,
  draft: NewExerciseNote,
): Promise<void> {
  const subject = requireOwner(access);
  const note = {
    ...draft,
    session_id: requireId(draft.session_id),
    occurrence_id: requireId(draft.occurrence_id),
    canonical_exercise_id: requireId(draft.canonical_exercise_id),
    note_event_id: requireId(draft.note_event_id),
    body: draft.body.trim(),
  };
  if (
    !validEvent(note) ||
    new Date(note.created_at_utc).toISOString() !== note.created_at_utc
  ) {
    throw new Error('invalidInput');
  }
  await db.withExclusiveTransactionAsync(async (tx) => {
    if (requireOwner(access) !== subject) throw new Error('notAuthenticated');
    const existing = await tx.getFirstAsync<ExerciseNoteEvent>(
      'SELECT session_id, occurrence_id, canonical_exercise_id, note_event_id, body, created_at_utc FROM local_exercise_note_events WHERE subject = ? AND note_event_id = ?',
      subject,
      note.note_event_id,
    );
    if (requireOwner(access) !== subject) throw new Error('notAuthenticated');
    if (existing) {
      if (
        existing.session_id !== note.session_id ||
        existing.occurrence_id !== note.occurrence_id ||
        existing.canonical_exercise_id !== note.canonical_exercise_id ||
        existing.note_event_id !== note.note_event_id ||
        existing.body !== note.body ||
        existing.created_at_utc !== note.created_at_utc
      ) {
        throw new Error('noteIdConflict');
      }
      return; // Immutable idempotent replay.
    }
    const occurrence = await tx.getFirstAsync<{
      canonical_exercise_id: string;
    }>(
      'SELECT canonical_exercise_id FROM local_workout_occurrences WHERE subject = ? AND session_id = ? AND occurrence_id = ?',
      subject,
      note.session_id,
      note.occurrence_id,
    );
    if (requireOwner(access) !== subject) throw new Error('notAuthenticated');
    if (
      !occurrence ||
      occurrence.canonical_exercise_id !== note.canonical_exercise_id
    ) {
      throw new Error('occurrenceNotFound');
    }
    if (requireOwner(access) !== subject) throw new Error('notAuthenticated');
    await tx.runAsync(
      'INSERT INTO local_exercise_note_events (subject, session_id, occurrence_id, canonical_exercise_id, note_event_id, body, created_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?)',
      subject,
      note.session_id,
      note.occurrence_id,
      note.canonical_exercise_id,
      note.note_event_id,
      note.body,
      note.created_at_utc,
    );
    if (requireOwner(access) !== subject) throw new Error('notAuthenticated');
  });
}

/** All events in a completed or active session, ordered for historical display. */
export const NOTES_BY_SESSION_SQL = [
  "SELECT COALESCE(json_group_array(json(item_json)), '[]') AS items_json",
  'FROM (SELECT json_object(',
  "'session_id', session_id, 'occurrence_id', occurrence_id,",
  "'canonical_exercise_id', canonical_exercise_id,",
  "'note_event_id', note_event_id, 'body', body,",
  "'created_at_utc', created_at_utc",
  ') AS item_json FROM local_exercise_note_events',
  'WHERE subject = ? AND session_id = ?',
  'ORDER BY created_at_utc, note_event_id LIMIT 1000)',
].join(' ');

export async function readSessionExerciseNotes(
  db: SqliteWorkoutPort,
  access: LocalSubjectAccess,
  sessionId: string,
): Promise<ExerciseNoteEvent[]> {
  const subject = requireOwner(access);
  const result = await db.getFirstAsync<{ items_json: string }>(
    NOTES_BY_SESSION_SQL,
    subject,
    requireId(sessionId),
  );
  if (requireOwner(access) !== subject) throw new Error('notAuthenticated');
  let raw: unknown;
  try {
    raw = JSON.parse(result?.items_json ?? '');
  } catch {
    throw new Error('corruptNotes');
  }
  if (
    !Array.isArray(raw) ||
    raw.length > 1000 ||
    !raw.every(
      (v: unknown): v is ExerciseNoteEvent =>
        Boolean(v) &&
        typeof v === 'object' &&
        validEvent(v as ExerciseNoteEvent) &&
        (v as ExerciseNoteEvent).session_id === sessionId.toLowerCase(),
    )
  )
    throw new Error('corruptNotes');
  return raw as ExerciseNoteEvent[];
}

/** Longitudinal view, ordered across sessions for the same canonical exercise. */
export async function readCanonicalExerciseNotes(
  db: SqliteWorkoutPort,
  access: LocalSubjectAccess,
  canonicalExerciseId: string,
): Promise<ExerciseNoteEvent[]> {
  const subject = requireOwner(access);
  const exerciseId = requireId(canonicalExerciseId);
  const result = await db.getFirstAsync<{ items_json: string }>(
    [
      "SELECT COALESCE(json_group_array(json(item_json)), '[]') AS items_json",
      'FROM (SELECT json_object(',
      "'session_id', session_id, 'occurrence_id', occurrence_id,",
      "'canonical_exercise_id', canonical_exercise_id,",
      "'note_event_id', note_event_id, 'body', body,",
      "'created_at_utc', created_at_utc",
      ') AS item_json FROM local_exercise_note_events',
      'WHERE subject = ? AND canonical_exercise_id = ?',
      'ORDER BY created_at_utc DESC, note_event_id DESC LIMIT 500)',
    ].join(' '),
    subject,
    exerciseId,
  );
  if (requireOwner(access) !== subject) throw new Error('notAuthenticated');
  let parsed: unknown;
  try {
    parsed = JSON.parse(result?.items_json ?? '[]');
  } catch {
    throw new Error('corruptNotes');
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length > 500 ||
    !parsed.every(
      (item: unknown) =>
        item !== null &&
        typeof item === 'object' &&
        validEvent(item as ExerciseNoteEvent) &&
        (item as ExerciseNoteEvent).canonical_exercise_id === exerciseId,
    )
  ) throw new Error('corruptNotes');
  return parsed as ExerciseNoteEvent[];
}
