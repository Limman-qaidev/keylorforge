/** Authenticated remote note history, read-only with local fallback on errors.
 * Never replace unsent local events with a server list.
 */
import { getSupabaseClient } from '../auth/supabase';
import { requestApi } from '../api/client';
import { isIsolatedRealWorkoutQa } from './qa-real-config';
import { confirmIsolatedQaWorkoutTarget } from './qa-real-preflight';
import type { LocalSubjectAccess } from './local-store';
import type { ExerciseNoteEvent } from './local-exercise-notes';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function current(access: LocalSubjectAccess): string {
  const subject = access.currentAuthenticatedSubject();
  if (!subject || !UUID.test(subject)) throw new Error('notAuthenticated');
  return subject.toLowerCase();
}

export function mergeExerciseNotes(
  local: readonly ExerciseNoteEvent[],
  remote: readonly ExerciseNoteEvent[],
): ExerciseNoteEvent[] {
  const entries = new Map<string, ExerciseNoteEvent>();
  for (const note of local) entries.set(note.note_event_id, note);
  for (const note of remote) {
    const existing = entries.get(note.note_event_id);
    if (existing) {
      if (
        existing.body !== note.body ||
        existing.session_id !== note.session_id ||
        existing.occurrence_id !== note.occurrence_id ||
        existing.canonical_exercise_id !== note.canonical_exercise_id ||
        Date.parse(existing.created_at_utc) !== Date.parse(note.created_at_utc)
      )
        throw new Error('noteHistoryConflict');
    } else {
      entries.set(note.note_event_id, note);
    }
  }
  return [...entries.values()].sort(
    (a, b) =>
      Date.parse(b.created_at_utc) - Date.parse(a.created_at_utc) ||
      b.note_event_id.localeCompare(a.note_event_id),
  );
}

/** A failed read returns no remote data; SQLite remains authoritative offline. */
export async function fetchRemoteExerciseNotes(
  access: LocalSubjectAccess,
  canonicalExerciseId: string,
): Promise<ExerciseNoteEvent[]> {
  const subject = current(access);
  if (!UUID.test(canonicalExerciseId)) throw new Error('invalidExerciseId');
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error || data.session?.user.id !== subject)
    throw new Error('notAuthenticated');
  const token = data.session.access_token;
  if (
    isIsolatedRealWorkoutQa() &&
    !(await confirmIsolatedQaWorkoutTarget(token))
  )
    throw new Error('invalidQaTarget');
  if (current(access) !== subject) throw new Error('notAuthenticated');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  let response: Response;
  try {
    response = await requestApi(
      `/workout-sessions/exercise-notes/${canonicalExerciseId}?limit=100`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      },
    );
  } finally {
    clearTimeout(timeout);
  }
  if (current(access) !== subject) throw new Error('notAuthenticated');
  if (response.status !== 200) throw new Error('notesRemoteUnavailable');
  const page: unknown = await response.json();
  if (
    !page ||
    typeof page !== 'object' ||
    !('items' in page) ||
    !Array.isArray(page.items) ||
    page.items.length > 100
  ) {
    throw new Error('invalidNotesResponse');
  }
  const result: ExerciseNoteEvent[] = [];
  for (const entry of page.items) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('invalidNotesResponse');
    }
    const row = entry as Record<string, unknown>;
    if (
      ![
        'note_event_id',
        'session_id',
        'occurrence_id',
        'canonical_exercise_id',
      ].every((key) => typeof row[key] === 'string' && UUID.test(row[key])) ||
      row.canonical_exercise_id !== canonicalExerciseId ||
      typeof row.body !== 'string' ||
      row.body.length < 1 ||
      row.body.length > 1000 ||
      typeof row.created_at_utc !== 'string' ||
      !Number.isFinite(Date.parse(row.created_at_utc))
    )
      throw new Error('invalidNotesResponse');
    result.push({
      note_event_id: row.note_event_id as string,
      session_id: row.session_id as string,
      occurrence_id: row.occurrence_id as string,
      canonical_exercise_id: row.canonical_exercise_id as string,
      body: row.body,
      created_at_utc: row.created_at_utc,
    });
  }
  if (current(access) !== subject) throw new Error('notAuthenticated');
  return result;
}
