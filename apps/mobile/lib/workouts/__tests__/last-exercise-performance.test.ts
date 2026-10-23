import {
  LAST_EXERCISE_PERFORMANCE_SQL,
  readLastCompletedExercisePerformance,
} from '../last-exercise-performance';
import type { SqliteWorkoutPort } from '../local-schema';
import type { LocalSubjectAccess } from '../local-store';

const OWNER = 'a3dbf764-e0e3-41aa-9895-6e58eadfbb14';
const EXERCISE = '502c4c87-80a5-4567-9aaf-296e43bfc4d1';
const SESSION = '1f2d27bc-4904-4f4f-9367-39565d78f211';
const access: LocalSubjectAccess = {
  currentAuthenticatedSubject: () => OWNER,
};

describe('historical workout reference', () => {
  it('queries only previously completed WORKING sets for the owner and canonical ID', async () => {
    const db = {
      getFirstAsync: jest.fn().mockResolvedValue({
        session_id: SESSION,
        completed_at_utc: '2026-10-22T15:00:00.000Z',
        measurement_type: 'reps',
        reps: 9,
        duration_seconds: null,
        distance_decimal: null,
        distance_unit: null,
        load_decimal: '37.5',
        load_unit: 'kg',
      }),
    } as unknown as SqliteWorkoutPort;
    expect(
      await readLastCompletedExercisePerformance(db, access, EXERCISE),
    ).toMatchObject({ reps: 9, load_decimal: '37.5' });
    expect(db.getFirstAsync).toHaveBeenCalledWith(
      LAST_EXERCISE_PERFORMANCE_SQL,
      OWNER,
      EXERCISE,
    );
    expect(LAST_EXERCISE_PERFORMANCE_SQL).toContain(
      "w.lifecycle_state = 'completed'",
    );
    expect(LAST_EXERCISE_PERFORMANCE_SQL).toContain(
      "s.set_role = 'WORKING'",
    );
  });

  it('returns null without fabricating a recommendation', async () => {
    const db = {
      getFirstAsync: jest.fn().mockResolvedValue(null),
    } as unknown as SqliteWorkoutPort;
    expect(await readLastCompletedExercisePerformance(db, access, EXERCISE)).toBeNull();
  });

  it('rejects account switching while reading', async () => {
    let current: string | null = OWNER;
    const db = {
      getFirstAsync: jest.fn().mockImplementation(async () => {
        current = null;
        return null;
      }),
    } as unknown as SqliteWorkoutPort;
    await expect(
      readLastCompletedExercisePerformance(db, {
        currentAuthenticatedSubject: () => current,
      }, EXERCISE),
    ).rejects.toThrow('notAuthenticated');
  });
});
