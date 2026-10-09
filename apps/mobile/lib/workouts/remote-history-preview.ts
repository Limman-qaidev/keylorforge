/**
 * Read-only remote-only workout recovery PREVIEW, not a historical import.
 *
 * We can only propose a recovery candidate after the owner's complete
 * authoritative history audit and an additional owner-fenced detail GET.
 * Never add fake local outbox ACKs, mutate SQLite or replace newer work.
 * An import needs a separate approved durable origin/provenance schema.
 */
import { requestApi } from '../api/client';
import type { SqliteWorkoutPort } from './local-schema';
import type { StartSyncAccess } from './start-session-sync';
import { auditCompletedWorkoutHistory } from './workout-history-audit';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_SETS = 1000;

export type RemoteRecoveryPreview = {
  sessionId: string;
  finishedAt: string;
  occurrenceCount: number;
  confirmedSets: number;
  workingSets: number;
};

export type RemoteRecoveryCandidate = {
  status: 'candidate';
  preview: RemoteRecoveryPreview;
  /** Fully verified server response, without authentication data. */
  detailJson: string;
  completionSnapshotId: string;
  finishMutationId: string;
};

export type RemoteRecoveryCheck =
  | { status: 'candidate'; preview: RemoteRecoveryPreview }
  | {
      status: 'paused';
      reason:
        | 'incompleteAudit'
        | 'notRemoteOnly'
        | 'localCollision'
        | 'auth'
        | 'network'
        | 'server'
        | 'invalidResponse';
    };

function ownerOf(access: StartSyncAccess): string {
  const subject = access.currentAuthenticatedSubject();
  if (!subject || !UUID.test(subject)) throw new Error('notAuthenticated');
  return subject.toLowerCase();
}
function fence(access: StartSyncAccess, expected: string) {
  if (ownerOf(access) !== expected) throw new Error('notAuthenticated');
}
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function id(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
function timestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
function validDecimal(value: unknown, allowZero = false): boolean {
  return (
    typeof value === 'string' &&
    /^(?:0|[1-9][0-9]{0,11})(?:[.][0-9]{1,3})?$/.test(value) &&
    (allowZero || Number(value) > 0)
  );
}
function validSet(row: Record<string, unknown>, occurrence: string): boolean {
  if (
    !id(row.set_id) ||
    !id(row.mutation_id) ||
    row.occurrence_id !== occurrence ||
    !['WARMUP', 'WORKING'].includes(String(row.set_role)) ||
    !timestamp(row.completed_at)
  )
    return false;
  const reps = row.measurement_type === 'reps';
  const time = row.measurement_type === 'time';
  const distance = row.measurement_type === 'distance';
  if (
    (!reps && !time && !distance) ||
    (reps && !positive(row.reps)) ||
    (time && !positive(row.duration_seconds)) ||
    (distance &&
      (!validDecimal(row.distance_decimal) ||
        !['m', 'km', 'mi'].includes(String(row.distance_unit)))) ||
    (!reps && row.reps !== null) ||
    (!time && row.duration_seconds !== null) ||
    (!distance && (row.distance_decimal !== null || row.distance_unit !== null))
  )
    return false;
  const hasLoad = row.load_decimal !== null;
  if (
    hasLoad !== (row.load_unit !== null) ||
    hasLoad !== (row.load_entry_semantics !== null) ||
    (hasLoad &&
      (!validDecimal(row.load_decimal, true) ||
        !['kg', 'lb'].includes(String(row.load_unit)) ||
        !['total', 'per_implement', 'machine_display', 'assistance'].includes(
          String(row.load_entry_semantics),
        )))
  )
    return false;
  return (
    (row.machine_profile_id === null || id(row.machine_profile_id)) &&
    (row.machine_configuration_id === null ||
      (id(row.machine_configuration_id) && row.machine_profile_id !== null))
  );
}

/**
 * Validate a FULL native-set detail; a snapshot summary alone is insufficient
 * to reconstruct performed training without inventing native measurement.
 */
function validateDetail(
  raw: unknown,
  expectedId: string,
): RemoteRecoveryPreview | null {
  const response = record(raw);
  const snapshot = record(response?.completion_snapshot);
  if (
    !response ||
    !snapshot ||
    response.session_id !== expectedId ||
    response.lifecycle_state !== 'completed' ||
    !id(response.completion_snapshot_id) ||
    !id(response.finish_mutation_id) ||
    snapshot.session_id !== expectedId ||
    snapshot.completion_snapshot_id !== response.completion_snapshot_id ||
    !timestamp(response.started_at) ||
    !timestamp(response.finished_at) ||
    Date.parse(response.finished_at) < Date.parse(response.started_at) ||
    !Array.isArray(response.occurrences) ||
    !Array.isArray(snapshot.unplanned_performed_occurrences)
  )
    return null;

  const declared = new Map<string, Record<string, unknown>>();
  for (const entry of snapshot.unplanned_performed_occurrences) {
    const occurrence = record(entry);
    if (
      !occurrence ||
      !id(occurrence.occurrence_id) ||
      declared.has(occurrence.occurrence_id)
    )
      return null;
    declared.set(occurrence.occurrence_id, occurrence);
  }
  const seen = new Set<string>();
  const orders = new Set<number>();
  let working = 0;
  let sets = 0;
  for (const rawOccurrence of response.occurrences) {
    const occurrence = record(rawOccurrence);
    const occurrenceId = occurrence?.occurrence_id;
    const expected =
      typeof occurrenceId === 'string' ? declared.get(occurrenceId) : undefined;
    if (
      !occurrence ||
      !id(occurrenceId) ||
      !expected ||
      !id(occurrence.canonical_exercise_id) ||
      occurrence.canonical_exercise_id !== expected.canonical_exercise_id ||
      occurrence.actual_order !== expected.actual_order ||
      !Number.isSafeInteger(occurrence.actual_order) ||
      (occurrence.actual_order as number) < 0 ||
      orders.has(occurrence.actual_order as number) ||
      !id(occurrence.first_set_id) ||
      !Array.isArray(occurrence.sets) ||
      occurrence.sets.length < 1 ||
      !Array.isArray(expected.set_ids)
    )
      return null;
    orders.add(occurrence.actual_order as number);
    const localSetIds = new Set<string>();
    for (const entry of occurrence.sets) {
      const row = record(entry);
      if (
        !row ||
        !validSet(row, occurrenceId) ||
        seen.has(row.set_id as string) ||
        localSetIds.has(row.set_id as string) ||
        Date.parse(row.completed_at as string) <
          Date.parse(response.started_at) ||
        Date.parse(row.completed_at as string) >
          Date.parse(response.finished_at)
      )
        return null;
      seen.add(row.set_id as string);
      localSetIds.add(row.set_id as string);
      if (row.set_role === 'WORKING') working++;
      sets++;
      if (sets > MAX_SETS) return null;
    }
    if (
      !localSetIds.has(occurrence.first_set_id) ||
      expected.set_ids.length !== localSetIds.size ||
      !expected.set_ids.every((setId) => localSetIds.has(setId))
    )
      return null;
    declared.delete(occurrenceId);
  }
  if (declared.size || working < 1 || sets < 1) return null;
  return {
    sessionId: expectedId,
    finishedAt: response.finished_at as string,
    occurrenceCount: response.occurrences.length,
    confirmedSets: sets,
    workingSets: working,
  };
}

/**
 * Defense in depth at the SQLite write boundary. The remote GET and history
 * audit occur outside this transaction; never trust metadata independently
 * of the exact native-set detail being persisted.
 */
export function isVerifiedRemoteHistoryCandidate(
  candidate: RemoteRecoveryCandidate,
  requestedSessionId: string,
): boolean {
  if (
    !id(requestedSessionId) ||
    candidate.preview.sessionId !== requestedSessionId ||
    !id(candidate.completionSnapshotId) ||
    !id(candidate.finishMutationId) ||
    typeof candidate.detailJson !== 'string' ||
    candidate.detailJson.length > 512_000
  ) {
    return false;
  }
  try {
    const data: unknown = JSON.parse(candidate.detailJson);
    const source = record(data);
    const preview = validateDetail(data, requestedSessionId);
    return (
      source !== null &&
      preview !== null &&
      source.completion_snapshot_id === candidate.completionSnapshotId &&
      source.finish_mutation_id === candidate.finishMutationId &&
      preview.sessionId === candidate.preview.sessionId &&
      preview.finishedAt === candidate.preview.finishedAt &&
      preview.occurrenceCount === candidate.preview.occurrenceCount &&
      preview.confirmedSets === candidate.preview.confirmedSets &&
      preview.workingSets === candidate.preview.workingSets
    );
  } catch {
    return false;
  }
}

async function hasAnyLocalTrace(
  db: SqliteWorkoutPort,
  subject: string,
  sessionId: string,
): Promise<boolean> {
  const session = await db.getFirstAsync<{ session_id: string }>(
    'SELECT session_id FROM local_workout_sessions WHERE subject = ? AND session_id = ?',
    subject,
    sessionId,
  );
  const mutation = await db.getFirstAsync<{ mutation_id: string }>(
    'SELECT mutation_id FROM local_workout_outbox WHERE subject = ? AND session_id = ? LIMIT 1',
    subject,
    sessionId,
  );
  return session !== null || mutation !== null;
}

export async function fetchRemoteOnlyWorkoutCandidate(
  db: SqliteWorkoutPort,
  access: StartSyncAccess,
  sessionId: string,
): Promise<
  RemoteRecoveryCandidate | Extract<RemoteRecoveryCheck, { status: 'paused' }>
> {
  if (!id(sessionId)) return { status: 'paused', reason: 'invalidResponse' };
  const subject = ownerOf(access);
  const canonicalId = sessionId.toLowerCase();
  const audit = await auditCompletedWorkoutHistory(db, access);
  fence(access, subject);
  if (audit.status !== 'complete') {
    return { status: 'paused', reason: 'incompleteAudit' };
  }
  if (!audit.remoteOnly.some((id) => id.toLowerCase() === canonicalId)) {
    return { status: 'paused', reason: 'notRemoteOnly' };
  }
  if (await hasAnyLocalTrace(db, subject, canonicalId)) {
    return { status: 'paused', reason: 'localCollision' };
  }
  fence(access, subject);
  const credentials = await access.acquireCurrentCredentials();
  fence(access, subject);
  if (
    !credentials ||
    credentials.subject.toLowerCase() !== subject ||
    !credentials.accessToken
  ) {
    return { status: 'paused', reason: 'auth' };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  let data: unknown;
  try {
    response = await requestApi(
      '/workout-sessions/' + canonicalId + '/history-detail',
      {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + credentials.accessToken },
        signal: controller.signal,
      },
    );
    fence(access, subject);
    if (response.status === 401 || response.status === 403) {
      return { status: 'paused', reason: 'auth' };
    }
    if (response.status === 429 || response.status >= 500) {
      return { status: 'paused', reason: 'server' };
    }
    if (response.status !== 200) {
      return { status: 'paused', reason: 'invalidResponse' };
    }
    data = await response.json();
  } catch (error) {
    fence(access, subject);
    void error;
    return { status: 'paused', reason: 'network' };
  } finally {
    clearTimeout(timeout);
  }
  fence(access, subject);
  const preview = validateDetail(data, canonicalId);
  if (!preview) return { status: 'paused', reason: 'invalidResponse' };
  if (await hasAnyLocalTrace(db, subject, canonicalId)) {
    return { status: 'paused', reason: 'localCollision' };
  }
  fence(access, subject);
  const responseDetail = record(data);
  if (
    !responseDetail ||
    !id(responseDetail.completion_snapshot_id) ||
    !id(responseDetail.finish_mutation_id)
  ) {
    return { status: 'paused', reason: 'invalidResponse' };
  }
  const detailJson = JSON.stringify(data);
  if (detailJson.length > 512_000) {
    return { status: 'paused', reason: 'invalidResponse' };
  }
  return {
    status: 'candidate',
    preview,
    detailJson,
    completionSnapshotId: responseDetail.completion_snapshot_id,
    finishMutationId: responseDetail.finish_mutation_id,
  };
}

/** Public non-mutating preflight never exposes the full historical payload. */
export async function previewRemoteOnlyWorkout(
  db: SqliteWorkoutPort,
  access: StartSyncAccess,
  sessionId: string,
): Promise<RemoteRecoveryCheck> {
  const result = await fetchRemoteOnlyWorkoutCandidate(db, access, sessionId);
  return result.status === 'candidate'
    ? { status: 'candidate', preview: result.preview }
    : result;
}
