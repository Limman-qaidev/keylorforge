import * as Crypto from 'expo-crypto';

import {
  deviceWorkoutClock,
  secureWorkoutIds,
} from '../native-workout-platform';

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(),
}));

describe('native Workout UUID adapter', () => {
  it('uses Expo native cryptographic UUID generation instead of pseudo-random JS', () => {
    const uuid = 'c226a777-d460-4d5f-bad6-f75667a9d022';
    jest.mocked(Crypto.randomUUID).mockReturnValue(uuid);
    expect(secureWorkoutIds.newUuid()).toBe(uuid);
    expect(Crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it('reads the real device clock and timezone without hard-coded offsets', () => {
    expect(deviceWorkoutClock.now()).toBeInstanceOf(Date);
    expect(typeof deviceWorkoutClock.timeZone()).toBe('string');
    expect(deviceWorkoutClock.timeZone().length).toBeGreaterThan(0);
  });
});
