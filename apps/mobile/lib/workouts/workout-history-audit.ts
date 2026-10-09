/**
 * Explicit, bounded, READ-ONLY comparison of completed workout history.
 *
 * PostgreSQL is authoritative only for acknowledged work. Pending local
 * FINISH intents are NEVER treated as missing remote workouts, overwritten,
 * replayed by this reader, or promoted to ACK. Remote-only sessions can be
 * identified for a later, separately approved import protocol.
 *
 * This does NOT reconcile cancelled sessions or machine/agenda revisions.
 * Neither production UI nor the foreground sync scheduler invokes this yet.
 */
import { requestApi } from '../api/client';
import type { SqliteWorkoutPort } from './local-schema';
import type { LocalFinishRow } from './local-finish';
import { listLocalFinishedWorkouts } from './local-finish-history';
import type { StartSyncAccess } from './start-session-sync';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 50;
const MAX_ENTRIES = 300;
const TIMEOUT_MS = 15_000;

type RemoteEntry = {
  session_id: string;
  completion_snapshot_id: string;
  finish_mutation_id: string;
  started_at: string;
  finished_at: string;
  local_date: string;
  total_sets: number;
  working_sets: number;
  completion_snapshot: Record<string, unknown>;
};

type RemotePage = {
  entries: RemoteEntry[];
  next_before_finished_at: string | null;
  next_before_session_id: string | null;
};

export type HistoryAudit = {
  status: 'complete' | 'incomplete' | 'paused';
  /** These are ID-only diagnostics; no workout content is sent to telemetry. */
  compared: number;
  pendingLocal: string[];
  remoteOnly: string[];
  acknowledgedLocalOnly: string[];
  diverged: string[];
  reason?: 'auth' | 'network' | 'server' | 'invalidResponse' | 'limit';
};

function subjectOf(access: StartSyncAccess): string {
  const subject = access.currentAuthenticatedSubject();
  if (!subject || !UUID.test(subject)) throw new Error('notAuthenticated');
  return subject.toLowerCase();
}

function checkOwner(access: StartSyncAccess, expected: string): void {
  if (subjectOf(access) !== expected) throw new Error('notAuthenticated');
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function validTime(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function verifiedPage(value: unknown): RemotePage | null {
  const page = object(value);
  if (
    !page ||
    !Array.isArray(page.entries) ||
    page.entries.length > PAGE_SIZE ||
    !(page.next_before_finished_at === null ||
      validTime(page.next_before_finished_at)) ||
    !(page.next_before_session_id === null ||
      (typeof page.next_before_session_id === 'string' &&
        UUID.test(page.next_before_session_id))) ||
    (page.next_before_finished_at === null) !==
      (page.next_before_session_id === null) ||
    (page.next_before_session_id !== null && page.entries.length !== PAGE_SIZE)
  ) {
    return null;
  }
  for (const item of page.entries) {
    const row = object(item);
    const snapshot = object(row?.completion_snapshot);
    if (
      !row ||
      !snapshot ||
      typeof row.session_id !== 'string' ||
      !UUID.test(row.session_id) ||
      typeof row.completion_snapshot_id !== 'string' ||
      !UUID.test(row.completion_snapshot_id) ||
      typeof row.finish_mutation_id !== 'string' ||
      !UUID.test(row.finish_mutation_id) ||
      !validTime(row.started_at) ||
      !validTime(row.finished_at) ||
      Date.parse(row.finished_at) < Date.parse(row.started_at) ||
      typeof row.local_date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.local_date) ||
      !Number.isSafeInteger(row.total_sets) ||
      (row.total_sets as number) < 1 ||
      !Number.isSafeInteger(row.working_sets) ||
      (row.working_sets as number) < 1 ||
      (row.working_sets as number) > (row.total_sets as number) ||
      snapshot.session_id !== row.session_id ||
      snapshot.completion_snapshot_id !== row.completion_snapshot_id
    ) {
      return null;
    }
  }
  return page as RemotePage;
}

/** Canonicalizes object key order only. Array order is meaningful. */
function canonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    const record = object(item);
    if (!record) return item;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, normalize(record[key])]),
    );
  };
  return JSON.stringify(normalize(value));
}

function partial(
  reason: NonNullable<HistoryAudit['reason']>,
  pendingLocal: string[] = [],
): HistoryAudit {
  return {
    status: reason === 'limit' ? 'incomplete' : 'paused',
    compared: 0,
    pendingLocal,
    remoteOnly: [],
    acknowledgedLocalOnly: [],
    diverged: [],
    reason,
  };
}

/**
 * This manual audit is deliberately not a pull/merge of remote user data.
 * An incomplete page scan never asserts that a workout is absent.
 */
export async function auditCompletedWorkoutHistory(
  db: SqliteWorkoutPort,
  access: StartSyncAccess,
): Promise<HistoryAudit> {
  const owner = subjectOf(access);
  const locals = new Map<
    string,
    Awaited<ReturnType<typeof listLocalFinishedWorkouts>>[number]
  >();
  let offset = 0;
  while (offset < MAX_ENTRIES) {
    const page = await listLocalFinishedWorkouts(db, access, {
      limit: PAGE_SIZE,
      offset,
    });
    checkOwner(access, owner);
    for (const item of page) {
      const id = item.session_id.toLowerCase();
      if (locals.has(id)) return partial('invalidResponse');
      locals.set(id, item);
    }
    if (page.length < PAGE_SIZE) break;
    offset += page.length;
    if (offset >= MAX_ENTRIES) return partial('limit');
  }

  const pendingLocal = [...locals.values()]
    .filter((item) => item.sync_state !== 'acknowledged')
    .map((item) => item.session_id);

  const remote = new Map<string, RemoteEntry>();
  let beforeFinished: string | null = null;
  let beforeSession: string | null = null;
  const cursors = new Set<string>();
  let finished = false;
  while (remote.size < MAX_ENTRIES) {
    checkOwner(access, owner);
    const credentials = await access.acquireCurrentCredentials();
    checkOwner(access, owner);
    if (
      !credentials ||
      !UUID.test(credentials.subject) ||
      credentials.subject.toLowerCase() !== owner ||
      !credentials.accessToken
    ) {
      return partial('auth', pendingLocal);
    }
    const parameters = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (beforeFinished && beforeSession) {
      parameters.set('before_finished_at', beforeFinished);
      parameters.set('before_session_id', beforeSession);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    let raw: unknown;
    try {
      response = await requestApi(
        '/workout-sessions/history?' + parameters.toString(),
        {
          method: 'GET',
          headers: { Authorization: 'Bearer ' + credentials.accessToken },
          signal: controller.signal,
        },
      );
      checkOwner(access, owner);
      if (response.status === 401 || response.status === 403) {
        return partial('auth', pendingLocal);
      }
      if (response.status === 429 || response.status >= 500) {
        return partial('server', pendingLocal);
      }
      if (response.status !== 200) return partial('invalidResponse', pendingLocal);
      raw = await response.json();
    } catch (error) {
      checkOwner(access, owner);
      void error;
      return partial('network', pendingLocal);
    } finally {
      clearTimeout(timeout);
    }
    checkOwner(access, owner);
    const page = verifiedPage(raw);
    if (!page) return partial('invalidResponse', pendingLocal);
    for (const entry of page.entries) {
      const id = entry.session_id.toLowerCase();
      if (remote.has(id)) return partial('invalidResponse', pendingLocal);
      remote.set(id, entry);
    }
    if (!page.next_before_finished_at || !page.next_before_session_id) {
      finished = true;
      break;
    }
    const cursor = page.next_before_finished_at + ':' + page.next_before_session_id;
    if (cursors.has(cursor)) return partial('invalidResponse', pendingLocal);
    cursors.add(cursor);
    beforeFinished = page.next_before_finished_at;
    beforeSession = page.next_before_session_id;
  }
  if (!finished) return partial('limit', pendingLocal);

  const audit: HistoryAudit = {
    status: 'complete',
    compared: 0,
    pendingLocal,
    remoteOnly: [],
    acknowledgedLocalOnly: [],
    diverged: [],
  };
  for (const [id, local] of locals) {
    const authoritative = remote.get(id);
    if (!authoritative) {
      if (local.sync_state === 'acknowledged') {
        audit.acknowledgedLocalOnly.push(id);
      }
      continue;
    }
    if (local.sync_state !== 'acknowledged') continue;
    const final = await db.getFirstAsync<LocalFinishRow>(
      'SELECT * FROM local_workout_final_snapshots WHERE subject = ? AND session_id = ?',
      owner,
      id,
    );
    checkOwner(access, owner);
    let sameSnapshot = false;
    try {
      if (final) {
        sameSnapshot =
          final.subject === owner &&
          final.session_id === id &&
          final.completion_snapshot_id === authoritative.completion_snapshot_id &&
          final.finish_mutation_id === authoritative.finish_mutation_id &&
          canonicalJson(JSON.parse(final.final_agenda_json)) ===
            canonicalJson(authoritative.completion_snapshot);
      }
    } catch {
      sameSnapshot = false;
    }
    if (
      !sameSnapshot ||
      local.completion_snapshot_id !== authoritative.completion_snapshot_id ||
      Date.parse(local.started_at_utc) !== Date.parse(authoritative.started_at) ||
      Date.parse(local.finished_at_utc) !== Date.parse(authoritative.finished_at) ||
      local.local_date !== authoritative.local_date ||
      local.total_sets !== authoritative.total_sets ||
      local.working_sets !== authoritative.working_sets
    ) {
      audit.diverged.push(id);
    } else {
      audit.compared++;
    }
  }
  for (const id of remote.keys()) {
    if (!locals.has(id)) audit.remoteOnly.push(id);
  }
  checkOwner(access, owner);
  return audit;
}
