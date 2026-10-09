/**
 * Account-fenced, immutable cache of server-only completed workout details.
 *
 * This is an isolated read-model, NEVER a performed local workout and NEVER an
 * outbox ACK. Do not call automatically from the sync coordinator or app UI.
 */
import type { SqliteQueryPort, SqliteWorkoutPort } from './local-schema';
import {
  fetchRemoteOnlyWorkoutCandidate,
  type RemoteRecoveryCandidate,
  type RemoteRecoveryCheck,
  type RemoteRecoveryPreview,
} from './remote-history-preview';
import type { StartSyncAccess } from './start-session-sync';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CachedRow = {
  subject: string;
  session_id: string;
  completion_snapshot_id: string;
  finish_mutation_id: string;
  origin: string;
  finished_at_utc: string;
  observed_at_utc: string;
  occurrence_count: number;
  total_sets: number;
  working_sets: number;
  detail_json: string;
};

export type RemoteHistoryCacheResult =
  | { status: 'stored' | 'alreadyStored'; preview: RemoteRecoveryPreview }
  | Extract<RemoteRecoveryCheck, { status: 'paused' }>
  | { status: 'paused'; reason: 'remoteConflict' };

function currentOwner(access: StartSyncAccess): string {
  const value = access.currentAuthenticatedSubject();
  if (!value || !UUID.test(value)) throw new Error('notAuthenticated');
  return value.toLowerCase();
}

function fence(access: StartSyncAccess, expected: string): void {
  if (currentOwner(access) !== expected) throw new Error('notAuthenticated');
}

async function hasLocalTrace(
  db: SqliteQueryPort,
  owner: string,
  sessionId: string,
): Promise<boolean> {
  const active = await db.getFirstAsync<{ session_id: string }>(
    'SELECT session_id FROM local_workout_sessions WHERE subject = ? AND session_id = ?',
    owner,
    sessionId,
  );
  const outbox = await db.getFirstAsync<{ mutation_id: string }>(
    'SELECT mutation_id FROM local_workout_outbox WHERE subject = ? AND session_id = ? LIMIT 1',
    owner,
    sessionId,
  );
  return active !== null || outbox !== null;
}

function readStored(
  db: SqliteQueryPort,
  owner: string,
  sessionId: string,
): Promise<CachedRow | null> {
  return db.getFirstAsync<CachedRow>(
    'SELECT * FROM local_remote_workout_history WHERE subject = ? AND session_id = ?',
    owner,
    sessionId,
  );
}

function matches(
  row: CachedRow,
  owner: string,
  candidate: RemoteRecoveryCandidate,
): boolean {
  return (
    row.subject === owner &&
    row.session_id === candidate.preview.sessionId &&
    row.origin === 'remote_complete' &&
    row.completion_snapshot_id === candidate.completionSnapshotId &&
    row.finish_mutation_id === candidate.finishMutationId &&
    row.finished_at_utc === candidate.preview.finishedAt &&
    row.occurrence_count === candidate.preview.occurrenceCount &&
    row.total_sets === candidate.preview.confirmedSets &&
    row.working_sets === candidate.preview.workingSets &&
    row.detail_json === candidate.detailJson
  );
}

/**
 * Explicit recovery request, never a background sync action. The API
 * preflight already verified owner, complete audit, actual measurements and
 * the immutable completion snapshot; the transaction RECHECKS local collisions.
 */
export async function cacheRemoteOnlyWorkout(
  db: SqliteWorkoutPort,
  access: StartSyncAccess,
  sessionId: string,
): Promise<RemoteHistoryCacheResult> {
  const owner = currentOwner(access);
  const candidate = await fetchRemoteOnlyWorkoutCandidate(
    db,
    access,
    sessionId,
  );
  fence(access, owner);
  if (candidate.status !== 'candidate') return candidate;

  let outcome: RemoteHistoryCacheResult = {
    status: 'paused',
    reason: 'remoteConflict',
  };
  await db.withExclusiveTransactionAsync(async (tx) => {
    fence(access, owner);
    if (await hasLocalTrace(tx, owner, candidate.preview.sessionId)) {
      outcome = { status: 'paused', reason: 'localCollision' };
      return;
    }
    const existing = await readStored(tx, owner, candidate.preview.sessionId);
    if (existing) {
      outcome = matches(existing, owner, candidate)
        ? { status: 'alreadyStored', preview: candidate.preview }
        : { status: 'paused', reason: 'remoteConflict' };
      fence(access, owner);
      return;
    }
    fence(access, owner);
    await tx.runAsync(
      'INSERT INTO local_remote_workout_history ' +
        '(subject, session_id, completion_snapshot_id, finish_mutation_id, ' +
        'origin, finished_at_utc, observed_at_utc, occurrence_count, total_sets, ' +
        'working_sets, detail_json) ' +
        "VALUES (?, ?, ?, ?, 'remote_complete', ?, ?, ?, ?, ?, ?)",
      owner,
      candidate.preview.sessionId,
      candidate.completionSnapshotId,
      candidate.finishMutationId,
      candidate.preview.finishedAt,
      new Date().toISOString(),
      candidate.preview.occurrenceCount,
      candidate.preview.confirmedSets,
      candidate.preview.workingSets,
      candidate.detailJson,
    );
    const verified = await readStored(tx, owner, candidate.preview.sessionId);
    if (!verified || !matches(verified, owner, candidate)) {
      throw new Error('remoteHistoryIntegrity');
    }
    fence(access, owner);
    outcome = { status: 'stored', preview: candidate.preview };
  });
  fence(access, owner);
  return outcome;
}

/** Safe owner-partitioned read: it cannot mutate workouts or outbox records. */
export async function readCachedRemoteOnlyWorkout(
  db: SqliteWorkoutPort,
  access: StartSyncAccess,
  sessionId: string,
): Promise<{ preview: RemoteRecoveryPreview; detailJson: string } | null> {
  const owner = currentOwner(access);
  if (!UUID.test(sessionId)) throw new Error('invalidInput');
  const row = await readStored(db, owner, sessionId.toLowerCase());
  fence(access, owner);
  if (!row) return null;
  if (row.origin !== 'remote_complete') throw new Error('corruptLocalData');
  return {
    preview: {
      sessionId: row.session_id,
      finishedAt: row.finished_at_utc,
      occurrenceCount: row.occurrence_count,
      confirmedSets: row.total_sets,
      workingSets: row.working_sets,
    },
    detailJson: row.detail_json,
  };
}
