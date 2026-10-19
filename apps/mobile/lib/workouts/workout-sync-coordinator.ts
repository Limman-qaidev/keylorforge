/**
 * Foreground-safe, bounded cross-queue M3 sync coordinator.
 *
 * Each child sender verifies the immutable payload, current authenticated
 * owner, server receipt and SQLite ACK independently. This coordinator never
 * writes outbox rows, guesses missing dependencies, or advances terminal
 * session state. One caller/SQLite handle can drain at a time.
 */
import type { SqliteWorkoutPort } from './local-schema';
import { syncNextPendingStart } from './start-session-sync';
import { syncNextPendingMachineCreate } from './machine-create-sync';
import { syncNextPendingConfirmedSet } from './confirmed-set-sync';
import { syncNextPendingFinish } from './finish-session-sync';
import { syncNextPendingCancel } from './cancel-session-sync';
import type { StartSyncAccess } from './start-session-sync';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const activeDrains = new WeakSet<SqliteWorkoutPort>();
const MAX_BATCH = 30;

export type SyncStage = 'start' | 'machine' | 'set' | 'finish' | 'cancel';
type SingleResult =
  | Awaited<ReturnType<typeof syncNextPendingStart>>
  | Awaited<ReturnType<typeof syncNextPendingMachineCreate>>
  | Awaited<ReturnType<typeof syncNextPendingConfirmedSet>>
  | Awaited<ReturnType<typeof syncNextPendingFinish>>
  | Awaited<ReturnType<typeof syncNextPendingCancel>>;

export type SyncDrainResult =
  | { state: 'busy'; acknowledged: 0 }
  | {
      state: 'idle' | 'yielded' | 'paused';
      acknowledged: number;
      stage?: SyncStage;
      reason?: string;
    };

function owner(access: StartSyncAccess): string {
  const subject = access.currentAuthenticatedSubject();
  if (!subject || !UUID.test(subject)) throw new Error('notAuthenticated');
  return subject.toLowerCase();
}

function verify(access: StartSyncAccess, expected: string): void {
  if (owner(access) !== expected) throw new Error('notAuthenticated');
}

const STAGES: readonly {
  stage: SyncStage;
  send: (
    db: SqliteWorkoutPort,
    access: StartSyncAccess,
  ) => Promise<SingleResult>;
}[] = [
  { stage: 'start', send: syncNextPendingStart },
  { stage: 'machine', send: syncNextPendingMachineCreate },
  { stage: 'set', send: syncNextPendingConfirmedSet },
  { stage: 'finish', send: syncNextPendingFinish },
  { stage: 'cancel', send: syncNextPendingCancel },
];

/**
 * Drain at most `maxAcks` acknowledged mutations in one foreground turn.
 * All stages run in dependency order. A child never sends an un-ACKed
 * dependency; a blocked stage does not prevent an unrelated ready stage
 * from progressing. On any fatal/retryable/auth/conflict error stop without
 * touching other rows, preventing tight loops on broken connectivity.
 */
export async function drainWorkoutSync(
  db: SqliteWorkoutPort,
  access: StartSyncAccess,
  maxAcks = 12,
): Promise<SyncDrainResult> {
  if (!Number.isSafeInteger(maxAcks) || maxAcks < 1 || maxAcks > MAX_BATCH) {
    throw new Error('invalidSyncBatch');
  }
  if (activeDrains.has(db)) return { state: 'busy', acknowledged: 0 };
  activeDrains.add(db);
  try {
    const subject = owner(access);
    let acknowledged = 0;
    while (acknowledged < maxAcks) {
      verify(access, subject);
      let progress = false;
      let dependent: SyncStage | undefined;
      for (const { stage, send } of STAGES) {
        verify(access, subject);
        const result = await send(db, access);
        verify(access, subject);
        if (result.state === 'acknowledged') {
          acknowledged++;
          progress = true;
          break;
        }
        if (result.state === 'idle') continue;
        if (result.state === 'blocked' && result.reason === 'dependency') {
          dependent ??= stage;
          continue;
        }
        if (result.state === 'inFlight') {
          return { state: 'paused', acknowledged, stage, reason: 'inFlight' };
        }
        if (result.state === 'conflict') {
          return { state: 'paused', acknowledged, stage, reason: 'conflict' };
        }
        if (result.state === 'blocked' || result.state === 'retryable') {
          return {
            state: 'paused',
            acknowledged,
            stage,
            reason: result.reason,
          };
        }
      }
      if (!progress) {
        return dependent
          ? {
              state: 'paused',
              acknowledged,
              stage: dependent,
              reason: 'dependency',
            }
          : { state: 'idle', acknowledged };
      }
    }
    return { state: 'yielded', acknowledged };
  } finally {
    activeDrains.delete(db);
  }
}
