/**
 * Opt-in, bounded recovery of server-only completed workouts (M3-MOB-014).
 *
 * This is NOT wired to foreground sync, app startup or the product UI.
 * The existing remote cache performs its own fresh full audit and validates
 * the native server detail again inside its exclusive SQLite transaction.
 * No local workout, performed set, cancellation or outbox row is altered here.
 */
import type { SqliteWorkoutPort } from './local-schema';
import {
  cacheRemoteOnlyWorkout,
  readCachedRemoteOnlyWorkout,
} from './remote-history-cache';
import type { StartSyncAccess } from './start-session-sync';
import { auditCompletedWorkoutHistory } from './workout-history-audit';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BATCH = 5;
const activeRecoveries = new WeakSet<SqliteWorkoutPort>();

export type RecoveryBatchOutcome = {
  /** 'idle' means no missing remote-only entries, NOT complete sync. */
  state: 'busy' | 'idle' | 'yielded' | 'paused';
  stored: number;
  alreadyCached: number;
  skippedConflicts: number;
  attempted: number;
  reason?: string;
};

function subjectOf(access: StartSyncAccess): string {
  const subject = access.currentAuthenticatedSubject();
  if (!subject || !UUID.test(subject)) throw new Error('notAuthenticated');
  return subject.toLowerCase();
}

function assertSubject(access: StartSyncAccess, expected: string): void {
  if (subjectOf(access) !== expected) throw new Error('notAuthenticated');
}

/**
 * Cheap advisory preflight so a fixed local collision at the start of the
 * authoritative history cannot starve later independent recoveries.
 * The cache writer repeats these checks inside its exclusive transaction.
 */
async function hasLocalTrace(
  db: SqliteWorkoutPort,
  access: StartSyncAccess,
  subject: string,
  id: string,
): Promise<boolean> {
  const session = await db.getFirstAsync<{ session_id: string }>(
    'SELECT session_id FROM local_workout_sessions WHERE subject = ? AND session_id = ?',
    subject,
    id,
  );
  assertSubject(access, subject);
  if (session) return true;
  const mutation = await db.getFirstAsync<{ mutation_id: string }>(
    'SELECT mutation_id FROM local_workout_outbox WHERE subject = ? AND session_id = ? LIMIT 1',
    subject,
    id,
  );
  assertSubject(access, subject);
  return mutation !== null;
}

function initial(state: RecoveryBatchOutcome['state']): RecoveryBatchOutcome {
  return {
    state,
    stored: 0,
    alreadyCached: 0,
    skippedConflicts: 0,
    attempted: 0,
  };
}

/**
 * Bounded by maxAttempts remote detail/recovery attempts per invocation.
 * A full audit must succeed before any candidate is considered. Every
 * uncached candidate is independently re-audited by the write boundary;
 * this intentionally trades performance for safety until #143 accepts
 * a reusable authoritative audit capability.
 *
 * Existing cached entries are skipped, not silently rewritten. Corrections,
 * tombstones, remote cancellations and changed historical source snapshots
 * require a separate reviewed reconciliation flow.
 */
export async function recoverRemoteHistoryBatch(
  db: SqliteWorkoutPort,
  access: StartSyncAccess,
  maxAttempts = 3,
): Promise<RecoveryBatchOutcome> {
  if (
    !Number.isSafeInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > MAX_BATCH
  ) {
    throw new Error('invalidRecoveryBatch');
  }
  if (activeRecoveries.has(db)) return initial('busy');
  activeRecoveries.add(db);
  try {
    const subject = subjectOf(access);
    const audit = await auditCompletedWorkoutHistory(db, access);
    assertSubject(access, subject);
    if (audit.status !== 'complete') {
      return {
        ...initial('paused'),
        reason: audit.reason ?? 'incompleteAudit',
      };
    }
    const entries = audit.remoteOnly;
    const ids = new Set<string>();
    for (const value of entries) {
      if (!UUID.test(value) || ids.has(value.toLowerCase())) {
        return { ...initial('paused'), reason: 'invalidResponse' };
      }
      ids.add(value.toLowerCase());
    }
    const outcome = initial('idle');
    for (const entry of entries) {
      assertSubject(access, subject);
      const id = entry.toLowerCase();
      const cached = await readCachedRemoteOnlyWorkout(db, access, id);
      assertSubject(access, subject);
      if (cached) {
        outcome.alreadyCached++;
        continue;
      }
      if (await hasLocalTrace(db, access, subject, id)) {
        outcome.skippedConflicts++;
        continue;
      }
      if (outcome.attempted === maxAttempts) {
        outcome.state = 'yielded';
        return outcome;
      }
      outcome.attempted++;
      const result = await cacheRemoteOnlyWorkout(db, access, id);
      assertSubject(access, subject);
      if (result.status === 'stored') {
        outcome.stored++;
      } else if (result.status === 'alreadyStored') {
        outcome.alreadyCached++;
      } else if (
        result.reason === 'localCollision' ||
        result.reason === 'remoteConflict'
      ) {
        // Preserve both sides. An independent candidate may still proceed.
        outcome.skippedConflicts++;
      } else {
        // Stop after network/auth/validation failure: no retry spin.
        outcome.state = 'paused';
        outcome.reason = result.reason;
        return outcome;
      }
    }
    return outcome;
  } finally {
    activeRecoveries.delete(db);
  }
}
