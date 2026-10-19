import { buildSetRequest } from '../free-workout-experience';

const exercise = {
  id: '502c4c87-80a5-4567-9aaf-296e43bfc4d1',
  measurement_type: 'reps' as const,
};

describe('M3 confirmation form never invents performed work', () => {
  it('requires an explicit positive quantity before persisting any set', () => {
    expect(() =>
      buildSetRequest(exercise, 'WORKING', '', '', 'kg', 'm'),
    ).toThrow();
    expect(() =>
      buildSetRequest(exercise, 'WORKING', '0', '', 'kg', 'm'),
    ).toThrow();
    expect(() =>
      buildSetRequest(exercise, 'WORKING', '8.5', '', 'kg', 'm'),
    ).toThrow();
  });

  it('preserves native load units, including a zero external load and comma input', () => {
    expect(
      buildSetRequest(exercise, 'WORKING', '8', '27,5', 'lb', 'm'),
    ).toEqual({
      canonicalExerciseId: exercise.id,
      role: 'WORKING',
      measurement: { measurementType: 'reps', reps: 8 },
      load: {
        decimal: '27.5',
        unit: 'lb',
        entrySemantics: 'total',
      },
    });
    expect(
      buildSetRequest(exercise, 'WARMUP', '12', '0', 'kg', 'm'),
    ).toMatchObject({
      role: 'WARMUP',
      load: { decimal: '0', unit: 'kg' },
    });
  });

  it('supports distance and time without automatically manufacturing load', () => {
    expect(
      buildSetRequest(
        { ...exercise, measurement_type: 'distance' },
        'WORKING',
        '1,25',
        '',
        'kg',
        'km',
      ).measurement,
    ).toEqual({
      measurementType: 'distance',
      distanceDecimal: '1.25',
      distanceUnit: 'km',
    });
    expect(
      buildSetRequest(
        { ...exercise, measurement_type: 'time' },
        'WORKING',
        '60',
        '',
        'kg',
        'm',
      ).measurement,
    ).toEqual({
      measurementType: 'time',
      durationSeconds: 60,
    });
    expect(() =>
      buildSetRequest(
        { ...exercise, measurement_type: 'distance' },
        'WORKING',
        '5',
        '20',
        'kg',
        'km',
      ),
    ).toThrow();
  });

  it('rejects malformed and unsupported measurements and excessive precision', () => {
    expect(() =>
      buildSetRequest(exercise, 'WORKING', '8', '20.9999', 'kg', 'm'),
    ).toThrow();
    expect(() =>
      buildSetRequest(
        { ...exercise, measurement_type: 'unknown' },
        'WORKING',
        '8',
        '',
        'kg',
        'm',
      ),
    ).toThrow();
  });
});
