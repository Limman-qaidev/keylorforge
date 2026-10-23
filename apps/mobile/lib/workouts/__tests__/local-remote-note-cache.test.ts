import {
  cacheRemoteExerciseNotes,
  readCachedExerciseNotes,
} from '../local-remote-note-cache';
import type { ExerciseNoteEvent } from '../local-exercise-notes';
import type { SqliteQueryPort, SqliteWorkoutPort } from '../local-schema';

const OWNER = 'a3dbf764-e0e3-41aa-9895-6e58eadfbb14';
const EXERCISE = '502c4c87-80a5-4567-9aaf-296e43bfc4d1';
const entry: ExerciseNoteEvent = {
  note_event_id: '1b428bd6-781d-44ec-8609-57af594a5511',
  session_id: '1f2d27bc-4904-4f4f-9367-39565d78f211',
  occurrence_id: 'c226a777-d460-4d5f-bad6-f75667a9d022',
  canonical_exercise_id: EXERCISE,
  body: 'Buena técnica',
  created_at_utc: '2026-10-23T11:37:24.000Z',
};

describe('subject-fenced remote note cache', () => {
  it('caches once, never rewrites an event and can read offline', async () => {
    const stored = new Map<string, ExerciseNoteEvent>();
    const db = {
      withExclusiveTransactionAsync: jest.fn(
        async (callback: (tx: SqliteQueryPort) => Promise<void>) => {
          await callback({
            getFirstAsync: async (_sql: string, _subject: string, id: string) =>
              stored.get(id) ?? null,
            runAsync: async (
              _sql: string,
              _subject: string,
              id: string,
              session: string,
              occurrence: string,
              canonical: string,
              body: string,
              timestamp: string,
            ) => {
              stored.set(id, {
                note_event_id: id,
                session_id: session,
                occurrence_id: occurrence,
                canonical_exercise_id: canonical,
                body,
                created_at_utc: timestamp,
              });
            },
          } as unknown as SqliteQueryPort);
        },
      ),
      getFirstAsync: jest.fn(async () => ({
        items_json: JSON.stringify([...stored.values()]),
      })),
    } as unknown as SqliteWorkoutPort;
    const access = { currentAuthenticatedSubject: () => OWNER };
    await cacheRemoteExerciseNotes(db, access, EXERCISE, [entry]);
    await cacheRemoteExerciseNotes(db, access, EXERCISE, [entry]);
    expect(stored.size).toBe(1);
    expect(await readCachedExerciseNotes(db, access, EXERCISE)).toEqual([
      entry,
    ]);
    await expect(
      cacheRemoteExerciseNotes(db, access, EXERCISE, [
        { ...entry, body: 'tampered' },
      ]),
    ).rejects.toThrow('noteHistoryConflict');
    expect(stored.get(entry.note_event_id)?.body).toBe(entry.body);
  });

  it('fails closed when logged out', async () => {
    const db = {
      withExclusiveTransactionAsync: jest.fn(),
    } as unknown as SqliteWorkoutPort;
    const access = { currentAuthenticatedSubject: () => null };
    await expect(
      cacheRemoteExerciseNotes(db, access, EXERCISE, [entry]),
    ).rejects.toThrow('notAuthenticated');
    expect(db.withExclusiveTransactionAsync).not.toHaveBeenCalled();
  });
});
