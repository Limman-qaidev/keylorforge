/**
 * M3 mobile outbox -> FastAPI: START_SESSION only.
 *
 * Network success is not an ACK. The response must match the immutable local
 * session and then the corresponding SQLite outbox row is acknowledged inside
 * an account-fenced exclusive transaction. A lost response/failed local write
 * leaves the original mutation pending and retryable with its stable UUID.
 *
 * This module deliberately does not send performed sets or schedule background
 * work. Future slices must enforce causal dependencies before those mutations.
 */
import { requestApi } from '../api/client';
import type { SqliteWorkoutPort } from './local-schema';
import {
  LocalWorkoutError,
  type LocalSubjectAccess,
  type LocalWorkoutSession,
} from './local-store';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const START_TIMEOUT_MS = 15_000;

type StartRow = {
  subject: string;
  mutation_id: string;
  session_id: string;
  mutation_kind: string;
  protocol_version: number;
  payload_json: string;
  delivery_state: string;
};

type StartCommand = {
  protocol_version: 1;
  session_id: string;
  mutation_id: string;
  started_at: string;
  time_zone: string;
};

export type StartSyncCredentials = {
  subject: string;
  accessToken: string;
};

export type StartSyncAccess = LocalSubjectAccess & {
  /** Read current provider state; never use a token captured at app launch. */
  acquireCurrentCredentials: () => Promise<StartSyncCredentials | null>;
};

export type StartSyncOutcome =
  | { state: 'idle' }
  | { state: 'inFlight' }
  | { state: 'acknowledged'; mutationId: string }
  | { state: 'retryable'; reason: 'network' | 'server' | 'invalidResponse' }
  | { state: 'blocked'; reason: 'auth' | 'rejected' | 'localData' }
  | { state: 'conflict'; mutationId: string };

const inFlight = new WeakSet<SqliteWorkoutPort>();

function currentSubject(access: LocalSubjectAccess): string {
  const raw = access.currentAuthenticatedSubject();
  if (!raw || !UUID.test(raw)) {
    throw new LocalWorkoutError('notAuthenticated');
  }
  return raw.toLowerCase();
}

function ensureSubject(access: LocalSubjectAccess, subject: string): void {
  if (currentSubject(access) !== subject) {
    throw new LocalWorkoutError('notAuthenticated');
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function validStartCommand(
  row: StartRow,
  local: LocalWorkoutSession,
): StartCommand | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(row.payload_json);
  } catch {
    return null;
  }
  const payload = asRecord(decoded);
  if (
    !payload ||
    payload.protocol_version !== 1 ||
    typeof payload.session_id !== 'string' ||
    typeof payload.mutation_id !== 'string' ||
    typeof payload.started_at !== 'string' ||
    typeof payload.time_zone !== 'string' ||
    !UUID.test(payload.session_id) ||
    !UUID.test(payload.mutation_id) ||
    payload.session_id.toLowerCase() !== row.session_id ||
    payload.mutation_id.toLowerCase() !== row.mutation_id ||
    payload.started_at !== local.started_at_utc ||
    payload.time_zone !== local.time_zone ||
    row.protocol_version !== 1 ||
    row.mutation_kind !== 'START_SESSION'
  ) {
    return null;
  }
  return payload as StartCommand;
}

function isMatchingReceipt(
  result: unknown,
  local: LocalWorkoutSession,
): boolean {
  const payload = asRecord(result);
  if (
    !payload ||
    typeof payload.id !== 'string' ||
    !UUID.test(payload.id) ||
    payload.id.toLowerCase() !== local.session_id ||
    payload.origin !== 'free' ||
    payload.lifecycle_state !== 'active' ||
    typeof payload.started_at !== 'string' ||
    typeof payload.time_zone !== 'string' ||
    payload.time_zone !== local.time_zone ||
    payload.utc_offset_minutes !== local.utc_offset_minutes ||
    payload.local_date !== local.local_date ||
    payload.agenda_revision !== 0
  ) {
    return false;
  }
  const remoteInstant = Date.parse(payload.started_at);
  const localInstant = Date.parse(local.started_at_utc);
  return (
    Number.isFinite(remoteInstant) &&
    Number.isFinite(localInstant) &&
    remoteInstant === localInstant
  );
}

async function sendStart(
  payloadJson: string,
  token: string,
): Promise<{ status: number; body: unknown }> {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), START_TIMEOUT_MS);
  try {
    const response = await requestApi('/workout-sessions/start', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: payloadJson,
      signal: abort.signal,
    });
    if (response.status !== 201) {
      return { status: response.status, body: null };
    }
    try {
      return { status: 201, body: await response.json() };
    } catch {
      return { status: 201, body: null };
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function changeDeliveryState(
  db: SqliteWorkoutPort,
  access: StartSyncAccess,
  row: StartRow,
  state: 'acknowledged' | 'conflict',
): Promise<boolean> {
  let updated = false;
  await db.withExclusiveTransactionAsync(async (tx) => {
    ensureSubject(access, row.subject);
    const current = await tx.getFirstAsync<StartRow>(
      'SELECT * FROM local_workout_outbox WHERE subject = ? AND mutation_id = ?',
      row.subject,
      row.mutation_id,
    );
    if (
      !current ||
      current.payload_json !== row.payload_json ||
      current.session_id !== row.session_id ||
      current.mutation_kind !== row.mutation_kind ||
      !['pending', state].includes(current.delivery_state)
    ) {
      throw new LocalWorkoutError('corruptLocalData');
    }
    if (current.delivery_state !== state) {
      await tx.runAsync(
        "UPDATE local_workout_outbox SET delivery_state = ? WHERE subject = ? AND mutation_id = ? AND delivery_state = 'pending'",
        state,
        row.subject,
        row.mutation_id,
      );
    }
    const check = await tx.getFirstAsync<StartRow>(
      'SELECT * FROM local_workout_outbox WHERE subject = ? AND mutation_id = ?',
      row.subject,
      row.mutation_id,
    );
    if (
      check?.delivery_state !== state ||
      check.payload_json !== row.payload_json
    ) {
      throw new LocalWorkoutError('corruptLocalData');
    }
    ensureSubject(access, row.subject);
    updated = true;
  });
  ensureSubject(access, row.subject);
  return updated;
}

/**
 * Manually invokable single-mutation sync boundary; no background scheduler.
 * Only an authenticated subject's durable START_SESSION can be dispatched.
 */
export async function syncNextPendingStart(
  db: SqliteWorkoutPort,
  access: StartSyncAccess,
): Promise<StartSyncOutcome> {
  if (inFlight.has(db)) {
    return { state: 'inFlight' };
  }
  inFlight.add(db);
  try {
    const subject = currentSubject(access);
    const row = await db.getFirstAsync<StartRow>(
      "SELECT * FROM local_workout_outbox WHERE subject = ? AND mutation_kind = 'START_SESSION' AND delivery_state = 'pending' ORDER BY created_at_utc, mutation_id LIMIT 1",
      subject,
    );
    ensureSubject(access, subject);
    if (!row) {
      return { state: 'idle' };
    }
    if (row.subject !== subject || row.delivery_state !== 'pending') {
      throw new LocalWorkoutError('corruptLocalData');
    }

    const local = await db.getFirstAsync<LocalWorkoutSession>(
      'SELECT * FROM local_workout_sessions WHERE subject = ? AND session_id = ?',
      subject,
      row.session_id,
    );
    ensureSubject(access, subject);
    if (!local || !validStartCommand(row, local)) {
      return { state: 'blocked', reason: 'localData' };
    }

    const credentials = await access.acquireCurrentCredentials();
    ensureSubject(access, subject);
    if (
      !credentials ||
      !UUID.test(credentials.subject) ||
      credentials.subject.toLowerCase() !== subject ||
      !credentials.accessToken
    ) {
      return { state: 'blocked', reason: 'auth' };
    }

    let response: { status: number; body: unknown };
    try {
      // Check active identity immediately before opening the HTTP request.
      ensureSubject(access, subject);
      response = await sendStart(row.payload_json, credentials.accessToken);
    } catch (error) {
      ensureSubject(access, subject);
      // Never consume a retryable request after timeout or transport failure.
      void error;
      return { state: 'retryable', reason: 'network' };
    }
    ensureSubject(access, subject);

    if (response.status === 409) {
      await changeDeliveryState(db, access, row, 'conflict');
      return { state: 'conflict', mutationId: row.mutation_id };
    }
    if (response.status === 401 || response.status === 403) {
      return { state: 'blocked', reason: 'auth' };
    }
    if (response.status === 429 || response.status >= 500) {
      return { state: 'retryable', reason: 'server' };
    }
    if (response.status !== 201) {
      return { state: 'blocked', reason: 'rejected' };
    }
    if (!isMatchingReceipt(response.body, local)) {
      return { state: 'retryable', reason: 'invalidResponse' };
    }
    await changeDeliveryState(db, access, row, 'acknowledged');
    return { state: 'acknowledged', mutationId: row.mutation_id };
  } finally {
    inFlight.delete(db);
  }
}
