/** Native SDK57 entropy provider; no Math.random fallback for durable IDs. */
import * as Crypto from 'expo-crypto';

import type { WorkoutIdProvider, WorkoutClock } from './free-workout-flow';

export const secureWorkoutIds: WorkoutIdProvider = {
  newUuid: () => Crypto.randomUUID(),
};

export const deviceWorkoutClock: WorkoutClock = {
  now: () => new Date(),
  timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
};
