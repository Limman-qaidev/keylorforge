/**
 * M3 FINISH_SESSION owner-fenced one-mutation dispatcher.
 *
 * This module has NO background worker or production-screen caller. It never
 * sends a locally completed session until every preceding session mutation
 * has a durable SQLite ACK. HTTP success alone is not an acknowledgement:
 * the server receipt and immutable local snapshot must match before an
 * account-fenced exclusive transaction marks the FINISH outbox acknowledged.
 */
import { requestApi } from '../api/client';
import type { LocalFinishRow } from './local-finish';
import type { SqliteWorkoutPort } from './local-schema';
import {
  LocalWorkoutError,
  type LocalSubjectAccess,
  type LocalWorkoutSession,
} from './local-store';
import type { StartSyncAccess } from './start-session-sync';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMEOUT_MS = 15_000;
const KIND = 'FINISH_SESSION';
const inFlight = new WeakSet<SqliteWorkoutPort>();

type PendingFinish = {
  subject: string;
  mutation_id: string;
  session_id: string;
  mutation_kind: string;
  protocol_version: number;
  payload_json: string;
  delivery_state: string;
  depends_on_mutation_id: string | null;
};
type Parent = {
  subject: string;
  mutation_id: string;
  session_id: string;
  delivery_state: string;
};
type Count = { count: number };

export type FinishSyncOutcome =
  | { state: 'idle' | 'inFlight' }
  | { state: 'acknowledged' | 'conflict'; mutationId: string }
  | {
      state: 'blocked';
      reason: 'dependency' | 'auth' | 'localData' | 'rejected';
    }
  | { state: 'retryable'; reason: 'network' | 'server' | 'invalidResponse' };

function currentSubject(access: LocalSubjectAccess): string {
  const raw = access.currentAuthenticatedSubject();
  if (!raw || !UUID.test(raw)) {
    throw new LocalWorkoutError('notAuthenticated');
  }
  return raw.toLowerCase();
}

function fence(access: LocalSubjectAccess, subject: string): void {
  if (currentSubject(access) !== subject) {
    throw new LocalWorkoutError('notAuthenticated');
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function immutableCommand(
  row: PendingFinish,
  snapshot: LocalFinishRow,
  session: LocalWorkoutSession,
): boolean {
  let raw: unknown;
  try {
    raw = JSON.parse(row.payload_json);
  } catch {
    return false;
  }
  const body = object(raw);
  const completion = body && object(body.completion_snapshot);
  const stored = JSON.parse(snapshot.final_agenda_json) as unknown;
  if (
    !body ||
    !completion ||
    row.protocol_version !== 1 ||
    row.mutation_kind !== KIND ||
    row.subject !== snapshot.subject ||
    row.subject !== session.subject ||
    row.session_id !== session.session_id ||
    row.session_id !== snapshot.session_id ||
    row.mutation_id !== snapshot.finish_mutation_id ||
    !UUID.test(row.mutation_id) ||
    !UUID.test(row.session_id) ||
    !UUID.test(snapshot.completion_snapshot_id) ||
    session.lifecycle_state !== 'completed' ||
    session.origin !== 'free' ||
    session.agenda_revision !== 0 ||
    body.protocol_version !== 1 ||
    body.kind !== KIND ||
    body.session_id !== row.session_id ||
    body.mutation_id !== row.mutation_id ||
    completion.completion_snapshot_id !== snapshot.completion_snapshot_id ||
    completion.session_id !== row.session_id ||
    completion.finished_at_utc !== snapshot.finished_at_utc ||
    completion.final_agenda_revision !== 0 ||
    completion.time_zone !== session.time_zone ||
    completion.local_date !== session.local_date ||
    !Array.isArray(completion.unplanned_performed_occurrences) ||
    completion.unplanned_performed_occurrences.length < 1 ||
    JSON.stringify(completion) !== JSON.stringify(stored)
  ) {
    return false;
  }
  return true;
}

function receiptMatches(
  body: unknown,
  row: PendingFinish,
  snapshot: LocalFinishRow,
): boolean {
  const result = object(body);
  if (
    !result ||
    result.lifecycle_state !== 'completed' ||
    result.session_id !== row.session_id ||
    result.mutation_id !== row.mutation_id ||
    result.completion_snapshot_id !== snapshot.completion_snapshot_id ||
    typeof result.completed_at !== 'string'
  ) {
    return false;
  }
  const serverTime = Date.parse(result.completed_at);
  const localTime = Date.parse(snapshot.finished_at_utc);
  return (
    Number.isFinite(serverTime) &&
    Number.isFinite(localTime) &&
    serverTime === localTime
  );
}

async function pendingAncestors(
  db: SqliteWorkoutPort,
  row: PendingFinish,
): Promise<boolean> {
  // A single parent edge is not enough when older or parallel session
  // mutations remain unacknowledged. Fail closed until all are durably ACKed.
  const missing = await db.getFirstAsync<Count>(
    "SELECT COUNT(*) AS count FROM local_workout_outbox WHERE subject = ? AND session_id = ? AND mutation_kind != 'FINISH_SESSION' AND delivery_state != 'acknowledged'",
    row.subject,
    row.session_id,
  );
  return missing?.count === 0;
}

async function predecessorAcknowledged(
  db: SqliteWorkoutPort,
  row: PendingFinish,
): Promise<boolean> {
  if (!row.depends_on_mutation_id || !UUID.test(row.depends_on_mutation_id)) {
    return false;
  }
  const parent = await db.getFirstAsync<Parent>(
    'SELECT subject, mutation_id, session_id, delivery_state FROM local_workout_outbox WHERE subject = ? AND mutation_id = ?',
    row.subject,
    row.depends_on_mutation_id,
  );
  return Boolean(
    parent &&
      parent.subject === row.subject &&
      parent.session_id === row.session_id &&
      parent.mutation_id === row.depends_on_mutation_id &&
      parent.delivery_state === 'acknowledged',
  );
}

async function loadFinish(
  db: SqliteWorkoutPort,
  row: PendingFinish,
): Promise<{ snapshot: LocalFinishRow; session: LocalWorkoutSession } | null> {
  const snapshot = await db.getFirstAsync<LocalFinishRow>(
    'SELECT * FROM local_workout_final_snapshots WHERE subject = ? AND session_id = ?',
    row.subject,
    row.session_id,
  );
  const session = await db.getFirstAsync<LocalWorkoutSession>(
    'SELECT * FROM local_workout_sessions WHERE subject = ? AND session_id = ?',
    row.subject,
    row.session_id,
  );
  if (!snapshot || !session) return null;
  try {
    return immutableCommand(row, snapshot, session)
      ? { snapshot, session }
      : null;
  } catch {
    // A corrupt local JSON snapshot must not reach the API.
    return null;
  }
}

async function send(
  row: PendingFinish,
  token: string,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await requestApi(
      '/workout-sessions/' + row.session_id + '/finish',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: row.payload_json,
        signal: controller.signal,
      },
    );
    if (response.status !== 201) return { status: response.status, body: null };
    try {
      return { status: 201, body: await response.json() };
    } catch {
      return { status: 201, body: null };
    }
  } finally {
    clearTimeout(timer);
  }
}

async function transition(
  db: SqliteWorkoutPort,
  access: StartSyncAccess,
  row: PendingFinish,
  state: 'acknowledged' | 'conflict',
): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    fence(access, row.subject);
    const current = await tx.getFirstAsync<PendingFinish>(
      'SELECT * FROM local_workout_outbox WHERE subject = ? AND mutation_id = ?',
      row.subject,
      row.mutation_id,
    );
    if (
      !current ||
      current.subject !== row.subject ||
      current.delivery_state !== 'pending' ||
      current.payload_json !== row.payload_json ||
      current.session_id !== row.session_id ||
      current.mutation_kind !== KIND ||
      current.depends_on_mutation_id !== row.depends_on_mutation_id
    ) {
      throw new LocalWorkoutError('corruptLocalData');
    }
    // The transaction revalidates the immutable local authority before ACK.
    const local = await loadFinish(tx as SqliteWorkoutPort, row);
    fence(access, row.subject);
    if (
      !local ||
      !(await predecessorAcknowledged(tx as SqliteWorkoutPort, row)) ||
      !(await pendingAncestors(tx as SqliteWorkoutPort, row))
    ) {
      throw new LocalWorkoutError('corruptLocalData');
    }
    fence(access, row.subject);
    await tx.runAsync(
      "UPDATE local_workout_outbox SET delivery_state = ? WHERE subject = ? AND mutation_id = ? AND delivery_state = 'pending'",
      state,
      row.subject,
      row.mutation_id,
    );
    const confirmed = await tx.getFirstAsync<PendingFinish>(
      'SELECT * FROM local_workout_outbox WHERE subject = ? AND mutation_id = ?',
      row.subject,
      row.mutation_id,
    );
    if (
      confirmed?.delivery_state !== state ||
      confirmed.payload_json !== row.payload_json
    ) {
      throw new LocalWorkoutError('corruptLocalData');
    }
    fence(access, row.subject);
  });
  fence(access, row.subject);
}

/** Explicit invocation, at most one account-owned FINISH mutation per call. */
export async function syncNextPendingFinish(
  db: SqliteWorkoutPort,
  access: StartSyncAccess,
): Promise<FinishSyncOutcome> {
  if (inFlight.has(db)) return { state: 'inFlight' };
  inFlight.add(db);
  try {
    const subject = currentSubject(access);
    const row = await db.getFirstAsync<PendingFinish>(
      "SELECT * FROM local_workout_outbox WHERE subject = ? AND mutation_kind = 'FINISH_SESSION' AND delivery_state = 'pending' ORDER BY rowid LIMIT 1",
      subject,
    );
    fence(access, subject);
    if (!row) return { state: 'idle' };
    if (
      row.subject !== subject ||
      !UUID.test(row.mutation_id) ||
      !UUID.test(row.session_id) ||
      row.delivery_state !== 'pending' ||
      row.mutation_kind !== KIND ||
      row.protocol_version !== 1 ||
      !row.depends_on_mutation_id ||
      !UUID.test(row.depends_on_mutation_id)
    ) {
      return { state: 'blocked', reason: 'localData' };
    }
    const local = await loadFinish(db, row);
    fence(access, subject);
    if (!local) return { state: 'blocked', reason: 'localData' };
    const parentReady = await predecessorAcknowledged(db, row);
    fence(access, subject);
    const allReady = await pendingAncestors(db, row);
    fence(access, subject);
    if (!parentReady || !allReady) {
      return { state: 'blocked', reason: 'dependency' };
    }
    const credentials = await access.acquireCurrentCredentials();
    fence(access, subject);
    if (
      !credentials ||
      !UUID.test(credentials.subject) ||
      credentials.subject.toLowerCase() !== subject ||
      !credentials.accessToken
    ) {
      return { state: 'blocked', reason: 'auth' };
    }
    let result: { status: number; body: unknown };
    try {
      fence(access, subject);
      result = await send(row, credentials.accessToken);
    } catch {
      fence(access, subject);
      return { state: 'retryable', reason: 'network' };
    }
    fence(access, subject);
    if (result.status === 401 || result.status === 403) {
      return { state: 'blocked', reason: 'auth' };
    }
    if (result.status === 429 || result.status >= 500) {
      return { state: 'retryable', reason: 'server' };
    }
    if (result.status === 409) {
      await transition(db, access, row, 'conflict');
      return { state: 'conflict', mutationId: row.mutation_id };
    }
    if (result.status !== 201) return { state: 'blocked', reason: 'rejected' };
    if (!receiptMatches(result.body, row, local.snapshot)) {
      return { state: 'retryable', reason: 'invalidResponse' };
    }
    await transition(db, access, row, 'acknowledged');
    return { state: 'acknowledged', mutationId: row.mutation_id };
  } finally {
    inFlight.delete(db);
  }
}
