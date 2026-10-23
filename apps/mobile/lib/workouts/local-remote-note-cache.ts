/** Immutable account-fenced remote observations cached for offline rereading.
 * Does not touch local pending notes, confirmed sets or workout outbox.
 */
import type { SqliteWorkoutPort } from './local-schema';
import type { LocalSubjectAccess } from './local-store';
import type { ExerciseNoteEvent } from './local-exercise-notes';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function owner(access: LocalSubjectAccess): string {
  const raw = access.currentAuthenticatedSubject();
  if (!raw || !UUID.test(raw)) throw new Error('notAuthenticated');
  return raw.toLowerCase();
}
function valid(note: ExerciseNoteEvent, exercise: string): boolean {
  return (
    [note.session_id, note.occurrence_id, note.canonical_exercise_id,
      note.note_event_id].every((v) => UUID.test(v)) &&
    note.canonical_exercise_id === exercise &&
    note.body.trim() === note.body &&
    note.body.length >= 1 && note.body.length <= 1000 &&
    Number.isFinite(Date.parse(note.created_at_utc))
  );
}
function identical(a: ExerciseNoteEvent, b: ExerciseNoteEvent): boolean {
  return (
    a.note_event_id === b.note_event_id &&
    a.session_id === b.session_id &&
    a.occurrence_id === b.occurrence_id &&
    a.canonical_exercise_id === b.canonical_exercise_id &&
    a.body === b.body &&
    Date.parse(a.created_at_utc) === Date.parse(b.created_at_utc)
  );
}

export async function cacheRemoteExerciseNotes(
  db: SqliteWorkoutPort,
  access: LocalSubjectAccess,
  canonicalExerciseId: string,
  notes: readonly ExerciseNoteEvent[],
): Promise<void> {
  const subject = owner(access);
  const exercise = canonicalExerciseId.toLowerCase();
  if (!UUID.test(exercise) || notes.length > 100 ||
      !notes.every((n) => valid(n, exercise))) {
    throw new Error('invalidNotesResponse');
  }
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const note of notes) {
      if (owner(access) !== subject) throw new Error('notAuthenticated');
      const old = await tx.getFirstAsync<ExerciseNoteEvent>(
        'SELECT note_event_id, session_id, occurrence_id, canonical_exercise_id, body, created_at_utc FROM local_remote_exercise_notes WHERE subject = ? AND note_event_id = ?',
        subject, note.note_event_id,
      );
      if (owner(access) !== subject) throw new Error('notAuthenticated');
      if (old && !identical(old, note)) {
        throw new Error('noteHistoryConflict');
      }
      if (!old) {
        await tx.runAsync(
          'INSERT INTO local_remote_exercise_notes (subject, note_event_id, session_id, occurrence_id, canonical_exercise_id, body, created_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?)',
          subject, note.note_event_id, note.session_id,
          note.occurrence_id, note.canonical_exercise_id, note.body,
          note.created_at_utc,
        );
        if (owner(access) !== subject) throw new Error('notAuthenticated');
      }
    }
  });
}

/** Offline presentation cache; newest first, bounded by 500 rows. */
export async function readCachedExerciseNotes(
  db: SqliteWorkoutPort,
  access: LocalSubjectAccess,
  canonicalExerciseId: string,
): Promise<ExerciseNoteEvent[]> {
  const subject = owner(access);
  const exercise = canonicalExerciseId.toLowerCase();
  if (!UUID.test(exercise)) throw new Error('invalidExerciseId');
  const row = await db.getFirstAsync<{ items_json: string }>(
    [
      "SELECT COALESCE(json_group_array(json(item_json)), '[]') AS items_json",
      "FROM (SELECT json_object(",
      "'session_id', session_id, 'occurrence_id', occurrence_id,",
      "'canonical_exercise_id', canonical_exercise_id,",
      "'note_event_id', note_event_id, 'body', body,",
      "'created_at_utc', created_at_utc",
      ') AS item_json FROM local_remote_exercise_notes',
      'WHERE subject = ? AND canonical_exercise_id = ?',
      'ORDER BY created_at_utc DESC, note_event_id DESC LIMIT 500)',
    ].join(' '),
    subject, exercise,
  );
  if (owner(access) !== subject) throw new Error('notAuthenticated');
  let parsed: unknown;
  try { parsed = JSON.parse(row?.items_json ?? '[]'); } catch {
    throw new Error('corruptNotes');
  }
  if (!Array.isArray(parsed) || parsed.length > 500 ||
      !parsed.every((item) =>
        item && typeof item === 'object' &&
        valid(item as ExerciseNoteEvent, exercise)
      )) throw new Error('corruptNotes');
  return parsed as ExerciseNoteEvent[];
}
