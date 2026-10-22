import {
  latestConfirmedSet,
  remainingRestSeconds,
} from '../rest-timer';
import type { ActiveFreeWorkoutOverview } from '../active-workout-overview';

const createSet = (
  setId: string,
  at: string,
  role: 'WORKING' | 'WARMUP' = 'WORKING',
) => ({
  set_id: setId,
  set_role: role,
  measurement_type: 'reps' as const,
  reps: 8,
  duration_seconds: null,
  distance_decimal: null,
  distance_unit: null,
  load_decimal: '25',
  load_unit: 'kg' as const,
  completed_at_utc: at,
});

describe('M3 live rest timing', () => {
  it('derives elapsed time from a persisted UTC timestamp after backgrounding', () => {
    const performed = createSet('a', '2026-10-22T15:00:00.000Z');
    expect(
      remainingRestSeconds(performed, 90, Date.parse('2026-10-22T15:00:35.000Z')),
    ).toBe(55);
    expect(
      remainingRestSeconds(performed, 90, Date.parse('2026-10-22T15:00:35.000Z'), 15),
    ).toBe(70);
    expect(
      remainingRestSeconds(performed, 90, Date.parse('2026-10-22T15:03:00.000Z')),
    ).toBe(0);
  });

  it('never starts rest from warm-up or absent sets', () => {
    const warmup = createSet('a', '2026-10-22T15:00:00.000Z', 'WARMUP');
    expect(remainingRestSeconds(warmup, 90, Date.parse('2026-10-22T15:00:05.000Z'))).toBe(0);
    expect(remainingRestSeconds(null, 90, Date.now())).toBe(0);
  });

  it('uses the most recently confirmed set across exercises, not the last card', () => {
    const earlier = createSet('a', '2026-10-22T15:00:00.000Z');
    const latest = createSet('b', '2026-10-22T15:05:00.000Z', 'WARMUP');
    const overview = {
      exercises: [
        { sets: [latest] },
        { sets: [earlier] },
      ],
    } as unknown as ActiveFreeWorkoutOverview;
    expect(latestConfirmedSet(overview)).toBe(latest);
  });
});
