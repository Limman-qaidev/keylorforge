import { mergeExerciseNotes } from '../remote-exercise-notes';
import type { ExerciseNoteEvent } from '../local-exercise-notes';

const one: ExerciseNoteEvent = {
  note_event_id: '1b428bd6-781d-44ec-8609-57af594a5511',
  session_id: '1f2d27bc-4904-4f4f-9367-39565d78f211',
  occurrence_id: 'c226a777-d460-4d5f-bad6-f75667a9d022',
  canonical_exercise_id: '502c4c87-80a5-4567-9aaf-296e43bfc4d1',
  body: 'Buenas sensaciones',
  created_at_utc: '2026-10-23T11:37:24.000Z',
};

describe('immutable notes across workout sessions', () => {
  it('retains local pending notes and deduplicates remote ACKs', () => {
    const second = {
      ...one,
      note_event_id: '0d72c629-6248-4221-8ab2-d9b9f1b63901',
      session_id: 'f9c17a11-7c0e-42d1-98ae-988827a499a8',
      body: 'Próxima sesión: más rango',
      created_at_utc: '2026-10-24T11:00:00.000Z',
    };
    expect(mergeExerciseNotes([one], [one, second])).toEqual([
      second,
      one,
    ]);
  });

  it('rejects conflicting reuse of an immutable event ID', () => {
    expect(() =>
      mergeExerciseNotes([one], [{ ...one, body: 'Corrupted' }]),
    ).toThrow('noteHistoryConflict');
  });
});
