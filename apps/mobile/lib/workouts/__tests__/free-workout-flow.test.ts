import { readActiveFreeWorkoutOverview } from '../active-workout-overview';
import { confirmLocalWorkoutSet } from '../local-confirmed-sets';
import { finishLocalFreeWorkout } from '../local-finish';
import type { SqliteWorkoutPort } from '../local-schema';
import { startLocalFreeWorkout, type LocalSubjectAccess } from '../local-store';
import {
  beginFreeWorkout,
  endFreeWorkout,
  recordFreeWorkoutSet,
  type WorkoutIdProvider,
  type WorkoutClock,
} from '../free-workout-flow';

jest.mock('../active-workout-overview', () => ({
  readActiveFreeWorkoutOverview: jest.fn(),
}));
jest.mock('../local-confirmed-sets', () => ({
  confirmLocalWorkoutSet: jest.fn(),
}));
jest.mock('../local-finish', () => ({
  finishLocalFreeWorkout: jest.fn(),
}));
jest.mock('../local-store', () => ({
  startLocalFreeWorkout: jest.fn(),
}));

const SUBJECT = 'a3dbf764-e0e3-41aa-9895-6e58eadfbb14';
const SESSION = '1f2d27bc-4904-4f4f-9367-39565d78f211';
const EXERCISE = '502c4c87-80a5-4567-9aaf-296e43bfc4d1';
const OTHER_EXERCISE = 'b47e9cd7-c6ac-5b79-9c20-ea4d5562bb6a';
const OCCURRENCE = 'c226a777-d460-4d5f-bad6-f75667a9d022';
const FRESH_IDS = [
  '1b428bd6-781d-44ec-8609-57af594a5511',
  '0d72c629-6248-4221-8ab2-d9b9f1b63901',
  '17e1a62d-965f-4caf-a509-c95ab2fe6438',
];
const clock: WorkoutClock = {
  now: () => new Date('2026-10-09T15:00:00.000Z'),
  timeZone: () => 'Europe/Madrid',
};
const access: LocalSubjectAccess = {
  currentAuthenticatedSubject: () => SUBJECT,
};
const db = {} as SqliteWorkoutPort;
const session = {
  subject: SUBJECT,
  session_id: SESSION,
  lifecycle_state: 'active' as const,
  origin: 'free' as const,
  started_at_utc: '2026-10-09T14:00:00.000Z',
  time_zone: 'Europe/Madrid',
  utc_offset_minutes: 120,
  local_date: '2026-10-09',
  original_agenda_json: '{"schema_version":1,"origin":"free","items":[]}',
  agenda_revision: 0,
};
const measurement = { measurementType: 'reps' as const, reps: 8 };

function provider(values: string[] = FRESH_IDS): WorkoutIdProvider {
  const available = [...values];
  return { newUuid: () => available.shift() ?? 'no-more-ids' };
}

function overview(workingSets = 1, existing = false) {
  return {
    session,
    exercises: existing
      ? [
          {
            occurrence_id: OCCURRENCE,
            canonical_exercise_id: EXERCISE,
            actual_order: 0,
            agenda_item_id: null,
            sets: [
              {
                set_id: FRESH_IDS[0]!,
                set_role: 'WORKING' as const,
                measurement_type: 'reps' as const,
                reps: 8,
                duration_seconds: null,
                distance_decimal: null,
                distance_unit: null,
                load_decimal: null,
                load_unit: null,
                completed_at_utc: '2026-10-09T14:30:00.000Z',
              },
            ],
          },
        ]
      : [],
    totalSets: existing ? 1 : 0,
    workingSets,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(startLocalFreeWorkout).mockResolvedValue(session);
  jest.mocked(readActiveFreeWorkoutOverview).mockResolvedValue(overview());
  jest.mocked(confirmLocalWorkoutSet).mockResolvedValue({
    set_id: FRESH_IDS[0],
  } as Awaited<ReturnType<typeof confirmLocalWorkoutSet>>);
  jest.mocked(finishLocalFreeWorkout).mockResolvedValue({
    session_id: SESSION,
  } as Awaited<ReturnType<typeof finishLocalFreeWorkout>>);
});

describe('local Free Workout journey coordinator', () => {
  it('starts an account-owned session with secure IDs and correct date/offset', async () => {
    expect(await beginFreeWorkout(db, access, provider(), clock)).toEqual(
      session,
    );
    expect(startLocalFreeWorkout).toHaveBeenCalledWith(db, access, {
      sessionId: FRESH_IDS[0],
      mutationId: FRESH_IDS[1],
      startedAtUtc: '2026-10-09T15:00:00.000Z',
      timeZone: 'Europe/Madrid',
      utcOffsetMinutes: 120,
      localDate: '2026-10-09',
    });
    await expect(
      beginFreeWorkout(db, access, provider(['invalid-id']), clock),
    ).rejects.toMatchObject({ code: 'invalidInput' });
    expect(startLocalFreeWorkout).toHaveBeenCalledTimes(1);
  });

  it('creates first occurrence only on confirmed work with canonical identity', async () => {
    await recordFreeWorkoutSet(db, access, provider(), clock, {
      canonicalExerciseId: OTHER_EXERCISE,
      role: 'WORKING',
      measurement,
      load: { decimal: '25', unit: 'kg', entrySemantics: 'machine_display' },
    });
    expect(confirmLocalWorkoutSet).toHaveBeenCalledWith(
      db,
      access,
      expect.objectContaining({
        sessionId: SESSION,
        setId: FRESH_IDS[0],
        mutationId: FRESH_IDS[1],
        occurrenceId: FRESH_IDS[2],
        firstSet: true,
        actualOrder: 0,
        canonicalExerciseId: OTHER_EXERCISE,
        agendaItemId: null,
        targetAtConfirmation: null,
        machine: null,
        completedAtUtc: '2026-10-09T15:00:00.000Z',
      }),
    );
  });

  it('adds a subsequent set to the previous occurrence instead of duplicating history', async () => {
    jest
      .mocked(readActiveFreeWorkoutOverview)
      .mockResolvedValue(overview(1, true));
    await recordFreeWorkoutSet(db, access, provider(), clock, {
      canonicalExerciseId: EXERCISE,
      role: 'WARMUP',
      measurement,
      load: null,
    });
    expect(confirmLocalWorkoutSet).toHaveBeenCalledWith(
      db,
      access,
      expect.objectContaining({
        occurrenceId: OCCURRENCE,
        firstSet: false,
        actualOrder: 0,
        setRole: 'WARMUP',
      }),
    );
  });

  it('refuses finish without a real WORKING set and allows local finish after confirmation', async () => {
    jest.mocked(readActiveFreeWorkoutOverview).mockResolvedValue(overview(0));
    await expect(
      endFreeWorkout(db, access, provider(), clock),
    ).rejects.toMatchObject({ code: 'noQualifyingWork' });
    expect(finishLocalFreeWorkout).not.toHaveBeenCalled();
    jest.mocked(readActiveFreeWorkoutOverview).mockResolvedValue(overview(1));
    await endFreeWorkout(db, access, provider(), clock);
    expect(finishLocalFreeWorkout).toHaveBeenCalledWith(db, access, {
      sessionId: SESSION,
      mutationId: FRESH_IDS[0],
      completionSnapshotId: FRESH_IDS[1],
      finishedAtUtc: '2026-10-09T15:00:00.000Z',
    });
  });

  it('prevents two simultaneous writes and rejects insecure or repeated IDs', async () => {
    let resolveStart: ((value: typeof session) => void) | undefined;
    jest.mocked(startLocalFreeWorkout).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStart = resolve;
        }),
    );
    const first = beginFreeWorkout(db, access, provider(), clock);
    await expect(
      beginFreeWorkout(db, access, provider(), clock),
    ).rejects.toMatchObject({ code: 'busy' });
    resolveStart?.(session);
    await expect(first).resolves.toEqual(session);
    await expect(
      beginFreeWorkout(
        db,
        access,
        provider([FRESH_IDS[0]!, FRESH_IDS[0]!]),
        clock,
      ),
    ).rejects.toMatchObject({ code: 'invalidInput' });
  });

  it('rejects unrecognized canonical IDs and missing active sessions without writes', async () => {
    await expect(
      recordFreeWorkoutSet(db, access, provider(), clock, {
        canonicalExerciseId: 'invalid',
        role: 'WORKING',
        measurement,
        load: null,
      }),
    ).rejects.toMatchObject({ code: 'invalidInput' });
    jest.mocked(readActiveFreeWorkoutOverview).mockResolvedValue(null);
    await expect(
      recordFreeWorkoutSet(db, access, provider(), clock, {
        canonicalExerciseId: EXERCISE,
        role: 'WORKING',
        measurement,
        load: null,
      }),
    ).rejects.toMatchObject({ code: 'noActiveWorkout' });
    expect(confirmLocalWorkoutSet).not.toHaveBeenCalled();
  });
});
