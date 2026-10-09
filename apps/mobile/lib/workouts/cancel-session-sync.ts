/**
 * Explicit, authenticated CANCEL_SESSION sender. No background scheduler.
 * Terminal local rows and historical sets survive network failures. HTTP
 * status alone is never a durable acknowledgement: verify server receipt,
 * then atomically ACK the exact unchanged owner-scoped intent.
 */
import { requestApi } from '../api/client';
import type { SqliteWorkoutPort } from './local-schema';
import type { LocalCancelRow } from './local-cancel';
import type { LocalWorkoutSession, LocalSubjectAccess } from './local-store';
import type { StartSyncAccess } from './start-session-sync';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMEOUT_MS = 15_000;
const inFlight = new WeakSet<SqliteWorkoutPort>();

type PendingCancel = {
  subject: string;
  mutation_id: string;
  session_id: string;
  mutation_kind: string;
  payload_json: string;
  protocol_version: number;
  delivery_state: string;
  depends_on_mutation_id: string | null;
};
type Parent = {
  mutation_id: string;
  session_id: string;
  delivery_state: string;
};
type Count = { count: number };

export type CancelSyncOutcome =
  | { state: 'idle' | 'inFlight' }
  | { state: 'acknowledged' | 'conflict'; mutationId: string }
  | { state: 'blocked'; reason: 'dependency' | 'auth' | 'localData' | 'rejected' }
  | { state: 'retryable'; reason: 'network' | 'server' | 'invalidResponse' };

function subjectOf(access: LocalSubjectAccess): string {
  const subject = access.currentAuthenticatedSubject();
  if (!subject || !UUID.test(subject)) throw new Error('notAuthenticated');
  return subject.toLowerCase();
}
function fence(access: LocalSubjectAccess, subject: string): void {
  if (subjectOf(access) !== subject) throw new Error('notAuthenticated');
}
function object(input: unknown): Record<string, unknown> | null {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}
function intentValid(
  row: PendingCancel,
  cancel: LocalCancelRow,
  session: LocalWorkoutSession,
): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(row.payload_json);
  } catch {
    return false;
  }
  const p = object(payload);
  return Boolean(
    p &&
      row.subject === cancel.subject &&
      row.subject === session.subject &&
      row.session_id === session.session_id &&
      row.session_id === cancel.session_id &&
      row.mutation_id === cancel.cancel_mutation_id &&
      row.mutation_kind === 'CANCEL_SESSION' &&
      row.protocol_version === 1 &&
      row.delivery_state === 'pending' &&
      UUID.test(row.session_id) &&
      UUID.test(row.mutation_id) &&
      row.depends_on_mutation_id &&
      UUID.test(row.depends_on_mutation_id) &&
      session.lifecycle_state === 'cancelled' &&
      session.origin === 'free' &&
      session.agenda_revision === 0 &&
      p.protocol_version === 1 &&
      p.kind === 'CANCEL_SESSION' &&
      p.session_id === row.session_id &&
      p.mutation_id === row.mutation_id &&
      p.cancelled_at_utc === cancel.cancelled_at_utc &&
      typeof p.discard_performed_sets_confirmed === 'boolean' &&
      (cancel.prior_confirmed_sets === 0 ||
        p.discard_performed_sets_confirmed === true) &&
      p.confirmed_set_count === cancel.prior_confirmed_sets &&
      Number.isSafeInteger(cancel.prior_confirmed_sets) &&
      cancel.prior_confirmed_sets >= 0 &&
      typeof p.cancelled_at_utc === 'string' &&
      Number.isFinite(Date.parse(p.cancelled_at_utc)),
  );
}
async function localState(
  db: SqliteWorkoutPort,
  row: PendingCancel,
): Promise<boolean> {
  const cancel = await db.getFirstAsync<LocalCancelRow>(
    'SELECT * FROM local_workout_cancellations WHERE subject = ? AND session_id = ?',
    row.subject,
    row.session_id,
  );
  const session = await db.getFirstAsync<LocalWorkoutSession>(
    'SELECT * FROM local_workout_sessions WHERE subject = ? AND session_id = ?',
    row.subject,
    row.session_id,
  );
  if (!cancel || !session || !intentValid(row, cancel, session)) return false;
  const count = await db.getFirstAsync<Count>(
    'SELECT COUNT(*) AS count FROM local_workout_sets WHERE subject = ? AND session_id = ?',
    row.subject,
    row.session_id,
  );
  return count?.count === cancel.prior_confirmed_sets;
}
async function dependenciesReady(
  db: SqliteWorkoutPort,
  row: PendingCancel,
): Promise<boolean> {
  if (!row.depends_on_mutation_id) return false;
  const parent = await db.getFirstAsync<Parent>(
    'SELECT mutation_id, session_id, delivery_state FROM local_workout_outbox WHERE subject = ? AND mutation_id = ?',
    row.subject,
    row.depends_on_mutation_id,
  );
  if (
    !parent ||
    parent.mutation_id !== row.depends_on_mutation_id ||
    parent.session_id !== row.session_id ||
    parent.delivery_state !== 'acknowledged'
  ) return false;
  const missing = await db.getFirstAsync<Count>(
    "SELECT COUNT(*) AS count FROM local_workout_outbox WHERE subject = ? AND session_id = ? AND mutation_kind != 'CANCEL_SESSION' AND delivery_state != 'acknowledged'",
    row.subject,
    row.session_id,
  );
  return missing?.count === 0;
}
function receiptValid(receipt: unknown, row: PendingCancel, cancel: LocalCancelRow): boolean {
  const parsed = object(receipt);
  if (
    !parsed ||
    parsed.session_id !== row.session_id ||
    parsed.mutation_id !== row.mutation_id ||
    parsed.lifecycle_state !== 'cancelled' ||
    parsed.confirmed_set_count !== cancel.prior_confirmed_sets ||
    typeof parsed.cancelled_at !== 'string'
  ) return false;
  return (
    Number.isFinite(Date.parse(parsed.cancelled_at)) &&
    Date.parse(parsed.cancelled_at) === Date.parse(cancel.cancelled_at_utc)
  );
}
async function transition(
  db: SqliteWorkoutPort,
  access: StartSyncAccess,
  row: PendingCancel,
  state: 'acknowledged' | 'conflict',
): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    fence(access, row.subject);
    const fresh = await tx.getFirstAsync<PendingCancel>(
      'SELECT * FROM local_workout_outbox WHERE subject = ? AND mutation_id = ?',
      row.subject,
      row.mutation_id,
    );
    if (
      !fresh ||
      fresh.delivery_state !== 'pending' ||
      fresh.subject !== row.subject ||
      fresh.session_id !== row.session_id ||
      fresh.payload_json !== row.payload_json ||
      fresh.depends_on_mutation_id !== row.depends_on_mutation_id ||
      fresh.mutation_kind !== 'CANCEL_SESSION' ||
      !(await localState(tx as SqliteWorkoutPort, row)) ||
      !(await dependenciesReady(tx as SqliteWorkoutPort, row))
    ) throw new Error('cancelConflict');
    fence(access, row.subject);
    await tx.runAsync(
      "UPDATE local_workout_outbox SET delivery_state = ? WHERE subject = ? AND mutation_id = ? AND delivery_state = 'pending'",
      state,
      row.subject,
      row.mutation_id,
    );
    const updated = await tx.getFirstAsync<PendingCancel>(
      'SELECT * FROM local_workout_outbox WHERE subject = ? AND mutation_id = ?',
      row.subject,
      row.mutation_id,
    );
    if (updated?.delivery_state !== state || updated.payload_json !== row.payload_json) {
      throw new Error('cancelConflict');
    }
    fence(access, row.subject);
  });
  fence(access, row.subject);
}
export async function syncNextPendingCancel(
  db: SqliteWorkoutPort,
  access: StartSyncAccess,
): Promise<CancelSyncOutcome> {
  if (inFlight.has(db)) return { state: 'inFlight' };
  inFlight.add(db);
  try {
    const subject = subjectOf(access);
    const row = await db.getFirstAsync<PendingCancel>(
      "SELECT * FROM local_workout_outbox WHERE subject = ? AND mutation_kind = 'CANCEL_SESSION' AND delivery_state = 'pending' ORDER BY rowid LIMIT 1",
      subject,
    );
    fence(access, subject);
    if (!row) return { state: 'idle' };
    if (row.subject !== subject || !(await localState(db, row))) {
      return { state: 'blocked', reason: 'localData' };
    }
    fence(access, subject);
    if (!(await dependenciesReady(db, row))) {
      return { state: 'blocked', reason: 'dependency' };
    }
    fence(access, subject);
    const auth = await access.acquireCurrentCredentials();
    fence(access, subject);
    if (
      !auth ||
      !UUID.test(auth.subject) ||
      auth.subject.toLowerCase() !== subject ||
      !auth.accessToken
    ) return { state: 'blocked', reason: 'auth' };
    let status: number;
    let body: unknown = null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await requestApi(
        '/workout-sessions/' + row.session_id + '/cancel',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + auth.accessToken,
            'Content-Type': 'application/json',
          },
          body: row.payload_json,
          signal: controller.signal,
        },
      );
      status = response.status;
      if (status === 201) {
        try {
          body = await response.json();
        } catch {
          body = null;
        }
      }
    } catch {
      fence(access, subject);
      return { state: 'retryable', reason: 'network' };
    } finally {
      clearTimeout(timeout);
    }
    fence(access, subject);
    if (status === 401 || status === 403) {
      return { state: 'blocked', reason: 'auth' };
    }
    if (status === 429 || status >= 500) {
      return { state: 'retryable', reason: 'server' };
    }
    if (status === 409) {
      await transition(db, access, row, 'conflict');
      return { state: 'conflict', mutationId: row.mutation_id };
    }
    if (status !== 201) return { state: 'blocked', reason: 'rejected' };
    const cancel = await db.getFirstAsync<LocalCancelRow>(
      'SELECT * FROM local_workout_cancellations WHERE subject = ? AND session_id = ?',
      subject,
      row.session_id,
    );
    fence(access, subject);
    if (!cancel || !receiptValid(body, row, cancel)) {
      return { state: 'retryable', reason: 'invalidResponse' };
    }
    await transition(db, access, row, 'acknowledged');
    return { state: 'acknowledged', mutationId: row.mutation_id };
  } finally {
    inFlight.delete(db);
  }
}
