/**
 * Opt-in, READ-ONLY drift diagnostics for previously cached remote workouts.
 *
 * A missing entry in the server's completed-history listing is NOT proof of
 * cancellation or deletion. Nothing here mutates SQLite or the causal outbox.
 * Product UI and foreground sync must not invoke this before M3 security QA.
 */
import type { SqliteWorkoutPort } from './local-schema';
import { readCachedRemoteOnlyWorkout } from './remote-history-cache';
import {
  fetchRemoteOnlyWorkoutCandidate,
  isVerifiedRemoteHistoryCandidate,
  type RemoteRecoveryCandidate,
} from './remote-history-preview';
import type { StartSyncAccess } from './start-session-sync';
import { auditCompletedWorkoutHistory } from './workout-history-audit';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BATCH = 5;
const active = new WeakSet<SqliteWorkoutPort>();

export type RemoteHistoryDriftFinding = {
  sessionId: string;
  status:
    'matching' | 'remoteChanged' | 'notListedAsCompleted' | 'localCollision';
};

export type RemoteHistoryDriftReport = {
  state: 'busy' | 'idle' | 'yielded' | 'paused';
  findings: RemoteHistoryDriftFinding[];
  /** The last fully inspected ID. Reuse to inspect the next page. */
  nextAfterSessionId: string | null;
  reason?: string;
};

/** ID-only paginated SQLite read. No payload is serialized into diagnostics. */
export const REMOTE_CACHE_IDS_SQL = [
  "SELECT COALESCE(json_group_array(json(item_json)), '[]') AS items_json",
  "FROM (SELECT json_object('session_id', session_id) AS item_json",
  'FROM local_remote_workout_history',
  'WHERE subject = ? AND session_id > ?',
  'ORDER BY session_id ASC LIMIT ?)',
].join(' ');

function subjectOf(access: StartSyncAccess): string {
  const subject = access.currentAuthenticatedSubject();
  if (!subject || !UUID.test(subject)) throw new Error('notAuthenticated');
  return subject.toLowerCase();
}

function fence(access: StartSyncAccess, expected: string): void {
  if (subjectOf(access) !== expected) throw new Error('notAuthenticated');
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Object order is incidental; arrays retain their semantic order. */
function canonicalJson(value: unknown): string {
  function normalize(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(normalize);
    const entry = object(input);
    if (!entry) return input;
    return Object.fromEntries(
      Object.keys(entry)
        .sort()
        .map((key) => [key, normalize(entry[key])]),
    );
  }
  return JSON.stringify(normalize(value));
}

function equalDetails(left: string, right: string): boolean {
  try {
    return canonicalJson(JSON.parse(left)) === canonicalJson(JSON.parse(right));
  } catch {
    return false;
  }
}

async function localTrace(
  db: SqliteWorkoutPort,
  access: StartSyncAccess,
  subject: string,
  sessionId: string,
): Promise<boolean> {
  const local = await db.getFirstAsync<{ session_id: string }>(
    'SELECT session_id FROM local_workout_sessions WHERE subject = ? AND session_id = ?',
    subject,
    sessionId,
  );
  fence(access, subject);
  if (local) return true;
  const outbox = await db.getFirstAsync<{ mutation_id: string }>(
    'SELECT mutation_id FROM local_workout_outbox WHERE subject = ? AND session_id = ? LIMIT 1',
    subject,
    sessionId,
  );
  fence(access, subject);
  return outbox !== null;
}

/** Validates a bounded, strictly increasing page before ANY comparison. */
async function readIds(
  db: SqliteWorkoutPort,
  access: StartSyncAccess,
  subject: string,
  cursor: string,
  batchSize: number,
): Promise<{ ids: string[]; hasMore: boolean } | null> {
  const result = await db.getFirstAsync<{ items_json: string }>(
    REMOTE_CACHE_IDS_SQL,
    subject,
    cursor,
    batchSize + 1,
  );
  fence(access, subject);
  let parsed: unknown;
  try {
    parsed = JSON.parse(result?.items_json ?? '');
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length > batchSize + 1) return null;
  const ids: string[] = [];
  let previous = cursor;
  for (const entry of parsed) {
    const id = object(entry)?.session_id;
    if (
      typeof id !== 'string' ||
      !UUID.test(id) ||
      id !== id.toLowerCase() ||
      id <= previous
    ) {
      return null;
    }
    ids.push(id);
    previous = id;
  }
  return {
    ids: ids.slice(0, batchSize),
    hasMore: ids.length > batchSize,
  };
}

function pause(
  findings: RemoteHistoryDriftFinding[],
  nextAfterSessionId: string | null,
  reason: string,
): RemoteHistoryDriftReport {
  return { state: 'paused', findings, nextAfterSessionId, reason };
}

/**
 * Compare up to five cached entries with a fully scanned authoritative
 * completed-history audit. Each listed item obtains a newly authenticated,
 * owner-verified full detail GET with the existing validator.
 *
 * No 'cancelled' conclusion is possible: the completed-history API does not
 * expose lifecycle/tombstone state. Missing = not listed as completed ONLY.
 */
export async function diagnoseCachedRemoteHistory(
  db: SqliteWorkoutPort,
  access: StartSyncAccess,
  options: { batchSize?: number; afterSessionId?: string } = {},
): Promise<RemoteHistoryDriftReport> {
  const size = options.batchSize ?? 3;
  const cursor = options.afterSessionId ?? '';
  if (
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > MAX_BATCH ||
    (cursor !== '' && (!UUID.test(cursor) || cursor !== cursor.toLowerCase()))
  ) {
    throw new Error('invalidDriftBatch');
  }
  if (active.has(db)) {
    return { state: 'busy', findings: [], nextAfterSessionId: null };
  }
  active.add(db);
  try {
    const subject = subjectOf(access);
    const audit = await auditCompletedWorkoutHistory(db, access);
    fence(access, subject);
    if (audit.status !== 'complete') {
      return pause([], null, audit.reason ?? 'incompleteAudit');
    }
    const page = await readIds(db, access, subject, cursor, size);
    if (!page) return pause([], null, 'corruptCacheIndex');
    const eligible = new Set(audit.remoteOnly.map((id) => id.toLowerCase()));
    const findings: RemoteHistoryDriftFinding[] = [];
    let next = cursor || null;
    for (const sessionId of page.ids) {
      fence(access, subject);
      const cached = await readCachedRemoteOnlyWorkout(db, access, sessionId);
      fence(access, subject);
      if (!cached) return pause(findings, next, 'cacheChangedDuringRead');
      let raw: Record<string, unknown> | null = null;
      try {
        raw = object(JSON.parse(cached.detailJson));
      } catch {
        return pause(findings, next, 'corruptCache');
      }
      const stored: RemoteRecoveryCandidate = {
        status: 'candidate',
        preview: cached.preview,
        detailJson: cached.detailJson,
        completionSnapshotId: String(raw?.completion_snapshot_id ?? ''),
        finishMutationId: String(raw?.finish_mutation_id ?? ''),
      };
      if (!isVerifiedRemoteHistoryCandidate(stored, sessionId)) {
        return pause(findings, next, 'corruptCache');
      }
      let status: RemoteHistoryDriftFinding['status'];
      if (await localTrace(db, access, subject, sessionId)) {
        status = 'localCollision';
      } else if (!eligible.has(sessionId)) {
        status = 'notListedAsCompleted';
      } else {
        const current = await fetchRemoteOnlyWorkoutCandidate(
          db,
          access,
          sessionId,
        );
        fence(access, subject);
        if (current.status !== 'candidate') {
          return pause(findings, next, current.reason);
        }
        status =
          current.completionSnapshotId === stored.completionSnapshotId &&
          current.finishMutationId === stored.finishMutationId &&
          current.preview.finishedAt === cached.preview.finishedAt &&
          current.preview.confirmedSets === cached.preview.confirmedSets &&
          current.preview.workingSets === cached.preview.workingSets &&
          current.preview.occurrenceCount === cached.preview.occurrenceCount &&
          equalDetails(cached.detailJson, current.detailJson)
            ? 'matching'
            : 'remoteChanged';
      }
      findings.push({ sessionId, status });
      next = sessionId;
    }
    const hasDrift = findings.some((item) => item.status !== 'matching');
    if (hasDrift) return pause(findings, next, 'unresolvedDrift');
    return {
      state: page.hasMore ? 'yielded' : 'idle',
      findings,
      nextAfterSessionId: next,
    };
  } finally {
    active.delete(db);
  }
}
