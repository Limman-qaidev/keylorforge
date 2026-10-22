/**
 * Basic M3 rest countdown: derive time from confirmed, durable set timestamps.
 * No interval counter is persisted or trusted; Date.now supports backgrounding.
 */
import type {
  ActiveFreeWorkoutOverview,
  ActiveSetSummary,
} from './active-workout-overview';

export const REST_PRESETS_SECONDS = [60, 90, 120] as const;
export type RestPresetSeconds = (typeof REST_PRESETS_SECONDS)[number];

export function latestConfirmedSet(
  overview: ActiveFreeWorkoutOverview | null,
): ActiveSetSummary | null {
  if (!overview) return null;
  let latest: ActiveSetSummary | null = null;
  for (const exercise of overview.exercises) {
    for (const set of exercise.sets) {
      if (
        latest === null ||
        Date.parse(set.completed_at_utc) > Date.parse(latest.completed_at_utc) ||
        (set.completed_at_utc === latest.completed_at_utc &&
          set.set_id > latest.set_id)
      ) {
        latest = set;
      }
    }
  }
  return latest;
}

/** A warm-up or expired interval must never show a running work-rest timer. */
export function remainingRestSeconds(
  set: ActiveSetSummary | null,
  durationSeconds: number,
  nowMilliseconds: number,
  adjustmentSeconds = 0,
): number {
  if (!set || set.set_role !== 'WORKING') return 0;
  const start = Date.parse(set.completed_at_utc);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(nowMilliseconds) ||
    !Number.isFinite(durationSeconds) ||
    !Number.isFinite(adjustmentSeconds)
  ) {
    return 0;
  }
  const target = start + (durationSeconds + adjustmentSeconds) * 1000;
  return Math.max(0, Math.ceil((target - nowMilliseconds) / 1000));
}
