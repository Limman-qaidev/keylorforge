/**
 * M3 correction read-model foundation for #167.
 *
 * Source performed sets are IMMUTABLE. This pure projector overlays only
 * explicitly accepted, ordered revision events. No SQLite/HTTP writes and
 * no fictional edit button. Server-side authoritative conflict checking is
 * required before accepting such events.
 */
import type { ActiveSetSummary } from './active-workout-overview';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EffectiveSetValues = Pick<
  ActiveSetSummary,
  | 'set_role'
  | 'measurement_type'
  | 'reps'
  | 'duration_seconds'
  | 'distance_decimal'
  | 'distance_unit'
  | 'load_decimal'
  | 'load_unit'
>;

export type SetCorrectionRevision = {
  revision_id: string;
  set_id: string;
  expected_previous_revision_id: string | null;
  corrected_at_utc: string;
  values: EffectiveSetValues;
};

export type EffectivePerformedSet = {
  /** Never altered, even when a correction is displayed. */
  source: ActiveSetSummary;
  effective: EffectiveSetValues;
  revisions: readonly SetCorrectionRevision[];
  corrected: boolean;
  latest_revision_id: string | null;
};

function validateValues(values: EffectiveSetValues): boolean {
  if (!['WARMUP', 'WORKING'].includes(values.set_role)) return false;
  const measurementType = values.measurement_type;
  if (
    measurementType !== 'reps' &&
    measurementType !== 'time' &&
    measurementType !== 'distance'
  )
    return false;
  if (
    (values.load_decimal === null) !== (values.load_unit === null) ||
    (values.load_unit !== null && !['kg', 'lb'].includes(values.load_unit))
  )
    return false;
  if (values.load_decimal !== null) {
    if (!/^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,3})?$/.test(values.load_decimal))
      return false;
  }
  if (measurementType === 'reps') {
    return (
      Number.isSafeInteger(values.reps) &&
      (values.reps ?? 0) > 0 &&
      values.duration_seconds === null &&
      values.distance_decimal === null &&
      values.distance_unit === null
    );
  }
  if (measurementType === 'time') {
    return (
      values.reps === null &&
      Number.isSafeInteger(values.duration_seconds) &&
      (values.duration_seconds ?? 0) > 0 &&
      values.distance_decimal === null &&
      values.distance_unit === null
    );
  }
  return (
    values.reps === null &&
    values.duration_seconds === null &&
    values.distance_decimal !== null &&
    /^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,3})?$/.test(values.distance_decimal) &&
    Number(values.distance_decimal) > 0 &&
    ['m', 'km', 'mi'].includes(String(values.distance_unit))
  );
}

/**
 * Rejects reordered, duplicated or stale corrections. This does not decide
 * concurrency: the remote mutation endpoint must atomically check the same
 * expected revision and return explicit 409 on stale writes.
 */
export function projectAcceptedSetCorrections(
  source: ActiveSetSummary,
  accepted: readonly SetCorrectionRevision[],
): EffectivePerformedSet {
  const original: EffectiveSetValues = {
    set_role: source.set_role,
    measurement_type: source.measurement_type,
    reps: source.reps,
    duration_seconds: source.duration_seconds,
    distance_decimal: source.distance_decimal,
    distance_unit: source.distance_unit,
    load_decimal: source.load_decimal,
    load_unit: source.load_unit,
  };
  if (!UUID.test(source.set_id) || !validateValues(original)) {
    throw new Error('invalidOriginalSet');
  }
  const seen = new Set<string>();
  let previous: string | null = null;
  let effective = original;
  let previousTime = Number.NEGATIVE_INFINITY;
  for (const event of accepted) {
    const instant = Date.parse(event.corrected_at_utc);
    if (
      !UUID.test(event.revision_id) ||
      seen.has(event.revision_id) ||
      event.set_id !== source.set_id ||
      event.expected_previous_revision_id !== previous ||
      !Number.isFinite(instant) ||
      instant < previousTime ||
      !validateValues(event.values) ||
      event.values.measurement_type !== original.measurement_type
    )
      throw new Error('invalidCorrectionChain');
    seen.add(event.revision_id);
    previous = event.revision_id;
    previousTime = instant;
    effective = { ...event.values };
  }
  return {
    source,
    effective,
    revisions: [...accepted],
    corrected: accepted.length > 0,
    latest_revision_id: previous,
  };
}
