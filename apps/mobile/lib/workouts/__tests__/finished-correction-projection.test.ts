import {
  projectAcceptedSetCorrections,
  type EffectiveSetValues,
  type SetCorrectionRevision,
} from '../finished-correction-projection';
import type { ActiveSetSummary } from '../active-workout-overview';

const original: ActiveSetSummary = {
  set_id: '1b428bd6-781d-44ec-8609-57af594a5511',
  set_role: 'WORKING',
  measurement_type: 'reps',
  reps: 10,
  duration_seconds: null,
  distance_decimal: null,
  distance_unit: null,
  load_decimal: '40',
  load_unit: 'kg',
  completed_at_utc: '2026-10-23T10:30:00.000Z',
};
const correction: EffectiveSetValues = {
  set_role: 'WORKING',
  measurement_type: 'reps',
  reps: 8,
  duration_seconds: null,
  distance_decimal: null,
  distance_unit: null,
  load_decimal: '45',
  load_unit: 'kg',
};
const first: SetCorrectionRevision = {
  revision_id: '0d72c629-6248-4221-8ab2-d9b9f1b63901',
  set_id: original.set_id,
  expected_previous_revision_id: null,
  corrected_at_utc: '2026-10-23T11:00:00.000Z',
  values: correction,
};

describe('pure M3 post-finish correction projection', () => {
  it('never mutates the source performed set', () => {
    const result = projectAcceptedSetCorrections(original, [first]);
    expect(result.source).toBe(original);
    expect(result.source.reps).toBe(10);
    expect(result.source.load_decimal).toBe('40');
    expect(result.effective.reps).toBe(8);
    expect(result.effective.load_decimal).toBe('45');
    expect(result.corrected).toBe(true);
    expect(original.reps).toBe(10);
  });

  it('applies two sequential revisions and preserves the full chain', () => {
    const later: SetCorrectionRevision = {
      ...first,
      revision_id: '74939158-b4ce-4f99-a6bb-a98b728ff903',
      expected_previous_revision_id: first.revision_id,
      corrected_at_utc: '2026-10-23T12:00:00.000Z',
      values: { ...correction, reps: 9 },
    };
    const result = projectAcceptedSetCorrections(original, [first, later]);
    expect(result.effective.reps).toBe(9);
    expect(result.source.reps).toBe(10);
    expect(result.revisions).toHaveLength(2);
    expect(result.latest_revision_id).toBe(later.revision_id);
  });

  it('fails closed on stale, duplicated or mismatched revisions', () => {
    expect(() =>
      projectAcceptedSetCorrections(original, [first, first]),
    ).toThrow('invalidCorrectionChain');
    expect(() =>
      projectAcceptedSetCorrections(original, [{
        ...first,
        expected_previous_revision_id: original.set_id,
      }]),
    ).toThrow('invalidCorrectionChain');
    expect(() =>
      projectAcceptedSetCorrections(original, [{
        ...first,
        values: { ...correction, reps: null },
      }]),
    ).toThrow('invalidCorrectionChain');
  });

  it('leaves unchanged sets unedited', () => {
    const result = projectAcceptedSetCorrections(original, []);
    expect(result.corrected).toBe(false);
    expect(result.latest_revision_id).toBeNull();
    expect(result.effective.reps).toBe(10);
  });
});
