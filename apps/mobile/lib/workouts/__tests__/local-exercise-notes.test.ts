import {
  appendLocalExerciseNote,
  readSessionExerciseNotes,
  NOTES_BY_SESSION_SQL,
  type ExerciseNoteEvent,
} from '../local-exercise-notes';
import type { SqliteQueryPort, SqliteWorkoutPort } from '../local-schema';

const OWNER = 'a3dbf764-e0e3-41aa-9895-6e58eadfbb14';
const OTHER = 'e426dd13-344a-4b69-8920-cb014715c6c1';
const SESSION = '1f2d27bc-4904-4f4f-9367-39565d78f211';
const EXERCISE = '502c4c87-80a5-4567-9aaf-296e43bfc4d1';
const OCCURRENCE = 'c226a777-d460-4d5f-bad6-f75667a9d022';

const note: ExerciseNoteEvent = {
  session_id: SESSION,
  occurrence_id: OCCURRENCE,
  canonical_exercise_id: EXERCISE,
  note_event_id: '1b428bd6-781d-44ec-8609-57af594a5511',
  body: 'Cambiar agarre: máquina distinta',
  created_at_utc: '2026-10-23T10:30:00.000Z',
};

describe('append-only local exercise notes', () => {
  it('writes through an account-scoped transaction and retains original notes', async () => {
    const stored: ExerciseNoteEvent[] = [];
    const tx = {
      getFirstAsync: jest.fn(
        async (sql: string, _subject: string, id: string) => {
          if (sql.includes('FROM local_workout_outbox'))
            throw Error('Outbox not allowed');
          if (sql.includes('FROM local_exercise_note_events')) {
            return stored.find((item) => item.note_event_id === id) ?? null;
          }
          return { canonical_exercise_id: EXERCISE };
        },
      ),
      runAsync: jest.fn(
        async (
          _sql: string,
          _subject: string,
          session: string,
          occurrence: string,
          exercise: string,
          id: string,
          body: string,
          created: string,
        ) => {
          stored.push({
            session_id: session,
            occurrence_id: occurrence,
            canonical_exercise_id: exercise,
            note_event_id: id,
            body,
            created_at_utc: created,
          });
        },
      ),
    };
    const db = {
      withExclusiveTransactionAsync: jest.fn(
        async (f: (tx: SqliteQueryPort) => Promise<void>) =>
          f(tx as unknown as SqliteQueryPort),
      ),
      getFirstAsync: jest.fn(async () => ({
        items_json: JSON.stringify(stored),
      })),
    } as unknown as SqliteWorkoutPort;
    const access = { currentAuthenticatedSubject: () => OWNER };
    await appendLocalExerciseNote(db, access, note);
    await appendLocalExerciseNote(db, access, note);
    expect(tx.runAsync).toHaveBeenCalledTimes(1);

    const followUp: ExerciseNoteEvent = {
      ...note,
      note_event_id: '0d72c629-6248-4221-8ab2-d9b9f1b63901',
      created_at_utc: '2026-10-23T10:35:00.000Z',
      body: 'Repetir técnica la próxima sesión',
    };
    await appendLocalExerciseNote(db, access, followUp);
    expect(stored).toHaveLength(2);
    const read = await readSessionExerciseNotes(db, access, SESSION);
    expect(read.map((row) => row.body)).toEqual([note.body, followUp.body]);
    expect(db.getFirstAsync).toHaveBeenCalledWith(
      NOTES_BY_SESSION_SQL,
      OWNER,
      SESSION,
    );
  });

  it('refuses note writes and reads for missing authentication', async () => {
    const db = {
      withExclusiveTransactionAsync: jest.fn(),
      getFirstAsync: jest.fn(),
    } as unknown as SqliteWorkoutPort;
    const access = { currentAuthenticatedSubject: () => null };
    await expect(appendLocalExerciseNote(db, access, note)).rejects.toThrow(
      'notAuthenticated',
    );
    await expect(readSessionExerciseNotes(db, access, SESSION)).rejects.toThrow(
      'notAuthenticated',
    );
    expect(db.withExclusiveTransactionAsync).not.toHaveBeenCalled();
  });

  it('rejects a mid-transaction account change before inserting', async () => {
    let current = OWNER;
    const db = {
      withExclusiveTransactionAsync: async (
        callback: (tx: SqliteQueryPort) => Promise<void>,
      ) =>
        callback({
          getFirstAsync: async () => {
            current = OTHER;
            return null;
          },
          runAsync: jest.fn(),
        }),
    } as unknown as SqliteWorkoutPort;
    await expect(
      appendLocalExerciseNote(
        db,
        { currentAuthenticatedSubject: () => current },
        note,
      ),
    ).rejects.toThrow('notAuthenticated');
  });
});
