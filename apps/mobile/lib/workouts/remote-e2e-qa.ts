/** Dev-only physical transport QA. No product or previous QA SQLite is accessed. */
import { getApiBaseUrl, requestApi } from '@/lib/api/client';
import { listExercises } from '@/lib/exercises/catalog-api';

import { readActiveFreeWorkoutOverview } from './active-workout-overview';
import { openRemoteE2eWorkoutDatabase } from './expo-sqlite-adapter';
import {
  beginFreeWorkout,
  endFreeWorkout,
  recordFreeWorkoutSet,
} from './free-workout-flow';
import { listLocalFinishedWorkouts } from './local-finish-history';
import type { SqliteWorkoutPort } from './local-schema';
import { getActiveLocalWorkout } from './local-store';
import {
  deviceWorkoutClock,
  secureWorkoutIds,
} from './native-workout-platform';
import type { StartSyncAccess } from './start-session-sync';
import { drainWorkoutSync } from './workout-sync-coordinator';

const EXPECTED_API = 'http://127.0.0.1:8001';
const EXPECTED_DATABASE = 'keylorforge_m3_e2e';

export type RemoteQaResult = {
  sessionId: string;
  totalSets: number;
  acknowledged: number;
};

function requireOwner(access: StartSyncAccess, expected: string): void {
  if (access.currentAuthenticatedSubject()?.toLowerCase() !== expected) {
    throw new Error('QA detenida: ha cambiado el usuario autenticado.');
  }
}

async function tokenFor(
  access: StartSyncAccess,
  subject: string,
): Promise<string> {
  requireOwner(access, subject);
  const credentials = await access.acquireCurrentCredentials();
  requireOwner(access, subject);
  if (
    credentials?.subject.toLowerCase() !== subject ||
    !credentials.accessToken
  ) {
    throw new Error('QA detenida: sesión de Supabase no válida.');
  }
  return credentials.accessToken;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Refuses to send workout data unless the real server verifies its test DB. */
export async function assertIsolatedM3Server(
  access: StartSyncAccess,
  subject: string,
): Promise<void> {
  if (!__DEV__ || getApiBaseUrl() !== EXPECTED_API) {
    throw new Error('QA bloqueada: se requiere Expo DEV y API local :8001.');
  }
  const token = await tokenFor(access, subject);
  const response = await requestApi('/_qa/m3-ready', {
    headers: { Authorization: 'Bearer ' + token },
  });
  requireOwner(access, subject);
  if (response.status !== 200) {
    throw new Error(
      'QA bloqueada: FastAPI no ha autorizado la base M3 (HTTP ' +
        response.status +
        ').',
    );
  }
  const result = object(await response.json());
  if (
    result?.ready !== true ||
    result.database !== EXPECTED_DATABASE ||
    !Number.isSafeInteger(result.exercises) ||
    (result.exercises as number) < 1
  ) {
    throw new Error('QA bloqueada: preflight de base M3 inválido.');
  }
}

async function readRemote(
  access: StartSyncAccess,
  subject: string,
  path: string,
): Promise<unknown> {
  const token = await tokenFor(access, subject);
  const response = await requestApi(path, {
    headers: { Authorization: 'Bearer ' + token },
  });
  requireOwner(access, subject);
  if (!response.ok) {
    throw new Error('Error de lectura remota (HTTP ' + response.status + ').');
  }
  return response.json();
}

async function drainAndRequireAck(
  db: SqliteWorkoutPort,
  access: StartSyncAccess,
  subject: string,
  sessionId: string,
): Promise<void> {
  // Guard again immediately before the mutation sender can issue HTTP POST.
  await assertIsolatedM3Server(access, subject);
  const outcome = await drainWorkoutSync(db, access);
  requireOwner(access, subject);
  if (outcome.state === 'paused' || outcome.state === 'busy') {
    throw new Error(
      'Sin ACK remoto: ' +
        outcome.state +
        ('stage' in outcome ? ' / ' + outcome.stage : '') +
        ('reason' in outcome ? ' / ' + outcome.reason : ''),
    );
  }
  const remaining = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM local_workout_outbox WHERE subject = ? AND session_id = ? AND delivery_state != 'acknowledged'",
    subject,
    sessionId,
  );
  requireOwner(access, subject);
  if (!remaining || remaining.count !== 0) {
    throw new Error('Existen mutaciones pendientes; no se avanza de fase.');
  }
}

export async function verifyIsolatedM3Finished(
  db: SqliteWorkoutPort,
  access: StartSyncAccess,
  subject: string,
  sessionId: string,
): Promise<RemoteQaResult> {
  await drainAndRequireAck(db, access, subject, sessionId);
  const history = await listLocalFinishedWorkouts(db, access, { limit: 10 });
  const own = history.find((item) => item.session_id === sessionId);
  if (!own || own.sync_state !== 'acknowledged' || own.working_sets !== 1) {
    throw new Error('FINISH no figura como ACK en el historial SQLite.');
  }
  const remote = object(
    await readRemote(access, subject, '/workout-sessions/history?limit=20'),
  );
  const entries = remote?.entries;
  if (!Array.isArray(entries)) {
    throw new Error('El historial remoto tiene un formato inválido.');
  }
  const matches = entries.filter(
    (item) => object(item)?.session_id === sessionId,
  );
  if (
    matches.length !== 1 ||
    object(matches[0])?.working_sets !== 1 ||
    object(matches[0])?.total_sets !== 1
  ) {
    throw new Error('FINISH remoto ausente, duplicado o con series distintas.');
  }
  const stillActive = await readRemote(
    access,
    subject,
    '/workout-sessions/active',
  );
  if (stillActive !== null) {
    throw new Error('La sesión sigue activa en el servidor tras FINISH.');
  }
  return { sessionId, totalSets: 1, acknowledged: 3 };
}

/**
 * A re-runnable one-button START -> SET -> FINISH -> ACK transport test.
 * Every step persists before sending; a failed run resumes from its immutable
 * SQLite ledger instead of creating a duplicate. No automatic background sync.
 */
export async function runIsolatedM3TransportQa(
  access: StartSyncAccess,
  notify: (message: string) => void,
): Promise<RemoteQaResult> {
  const subject = access.currentAuthenticatedSubject()?.toLowerCase();
  if (!subject) throw new Error('Necesitas iniciar sesión para probar M3.');
  notify('Verificando servidor y base de pruebas...');
  await assertIsolatedM3Server(access, subject);
  const db = await openRemoteE2eWorkoutDatabase(subject);
  requireOwner(access, subject);

  const finished = await listLocalFinishedWorkouts(db, access, { limit: 10 });
  if (finished.length > 1) {
    throw new Error('Hay varias sesiones QA; no se creará ninguna más.');
  }
  if (finished.length === 1) {
    notify('Recuperando prueba previa; verificando ACK y PostgreSQL...');
    return verifyIsolatedM3Finished(db, access, subject, finished[0]!.session_id);
  }

  let active = await getActiveLocalWorkout(db, access);
  if (!active) {
    const remoteActive = await readRemote(
      access,
      subject,
      '/workout-sessions/active',
    );
    if (remoteActive !== null) {
      throw new Error(
        'Hay una sesión activa remota ajena a esta QA; no se sobrescribe.',
      );
    }
    notify('START: guardando sesión nueva solo en SQLite QA...');
    active = await beginFreeWorkout(
      db,
      access,
      secureWorkoutIds,
      deviceWorkoutClock,
    );
  }

  const sessionId = active.session_id;
  notify('START: enviando a FastAPI y esperando ACK...');
  await drainAndRequireAck(db, access, subject, sessionId);
  const started = object(
    await readRemote(access, subject, '/workout-sessions/active'),
  );
  if (started?.id !== sessionId || started.lifecycle_state !== 'active') {
    throw new Error('START remoto no coincide con SQLite.');
  }

  const overview = await readActiveFreeWorkoutOverview(db, access);
  if (!overview || overview.session.session_id !== sessionId) {
    throw new Error('La sesión local no está activa.');
  }
  if (overview.totalSets === 0) {
    notify('SET: seleccionando un ejercicio real del catálogo remoto...');
    const page = await listExercises(await tokenFor(access, subject), {
      page: 1,
      pageSize: 100,
    });
    requireOwner(access, subject);
    const exercise = page.items.find(
      (item) => item.measurement_type === 'reps',
    );
    if (!exercise) {
      throw new Error('La API no ofrece ningún ejercicio de repeticiones.');
    }
    await recordFreeWorkoutSet(
      db,
      access,
      secureWorkoutIds,
      deviceWorkoutClock,
      {
        canonicalExerciseId: exercise.id,
        role: 'WORKING',
        measurement: { measurementType: 'reps', reps: 8 },
        load: null,
      },
    );
  } else if (overview.totalSets !== 1 || overview.workingSets !== 1) {
    throw new Error('Series de QA inesperadas; no se envía ningún cambio.');
  }
  notify('SET: enviando serie confirmada y esperando ACK...');
  await drainAndRequireAck(db, access, subject, sessionId);

  notify('FINISH: completando sesión local y enviando snapshot...');
  await endFreeWorkout(db, access, secureWorkoutIds, deviceWorkoutClock);
  return verifyIsolatedM3Finished(db, access, subject, sessionId);
}
