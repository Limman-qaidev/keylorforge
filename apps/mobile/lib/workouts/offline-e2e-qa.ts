/**
 * Genuine disconnected-to-reconnected M3 transport QA.
 * Three explicit phases; a fresh QA-only SQLite file; no product data resets.
 * The "offline" phase REFUSES to run while :8001 responds, including adb reverse.
 */
import { getApiBaseUrl, requestApi } from '@/lib/api/client';
import { listExercises } from '@/lib/exercises/catalog-api';

import { readActiveFreeWorkoutOverview } from './active-workout-overview';
import { openOfflineE2eWorkoutDatabase } from './expo-sqlite-adapter';
import {
  beginFreeWorkout,
  endFreeWorkout,
  recordFreeWorkoutSet,
} from './free-workout-flow';
import { listLocalFinishedWorkouts } from './local-finish-history';
import { getActiveLocalWorkout } from './local-store';
import {
  deviceWorkoutClock,
  secureWorkoutIds,
} from './native-workout-platform';
import {
  assertIsolatedM3Server,
  verifyIsolatedM3Finished,
  type RemoteQaResult,
} from './remote-e2e-qa';
import type { StartSyncAccess } from './start-session-sync';

const API = 'http://127.0.0.1:8001';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function subjectFor(access: StartSyncAccess): string {
  const subject = access.currentAuthenticatedSubject()?.toLowerCase();
  if (!subject || !UUID.test(subject)) {
    throw new Error('QA: autenticación no disponible.');
  }
  if (!__DEV__ || getApiBaseUrl() !== API) {
    throw new Error('QA: solo Android DEV con API local :8001.');
  }
  return subject;
}

function checkOwner(access: StartSyncAccess, subject: string): void {
  if (subjectFor(access) !== subject) {
    throw new Error('QA detenida: cambio de cuenta.');
  }
}

async function readExerciseSeed(
  access: StartSyncAccess,
  subject: string,
): Promise<string | null> {
  const db = await openOfflineE2eWorkoutDatabase(subject);
  checkOwner(access, subject);
  const row = await db.getFirstAsync<{ canonical_exercise_id: string }>(
    'SELECT canonical_exercise_id FROM qa_offline_seed WHERE subject = ?',
    subject,
  );
  checkOwner(access, subject);
  if (row && !UUID.test(row.canonical_exercise_id)) {
    throw new Error('QA: ejercicio sembrado inválido; no se sustituye.');
  }
  return row?.canonical_exercise_id ?? null;
}

/** First step, ONLINE. Persists only one real canonical exercise ID for later offline work. */
export async function prepareOfflineM3Qa(
  access: StartSyncAccess,
): Promise<string> {
  const subject = subjectFor(access);
  await assertIsolatedM3Server(access, subject);
  const db = await openOfflineE2eWorkoutDatabase(subject);
  await db.execAsync(
    'CREATE TABLE IF NOT EXISTS qa_offline_seed (subject TEXT PRIMARY KEY, canonical_exercise_id TEXT NOT NULL)',
  );
  checkOwner(access, subject);
  const previous = await readExerciseSeed(access, subject);
  if (previous) return previous;
  const creds = await access.acquireCurrentCredentials();
  checkOwner(access, subject);
  if (!creds || creds.subject.toLowerCase() !== subject) {
    throw new Error('QA: token de pruebas no disponible.');
  }
  const response = await requestApi('/workout-sessions/active', {
    headers: { Authorization: 'Bearer ' + creds.accessToken },
  });
  checkOwner(access, subject);
  if (!response.ok || (await response.json()) !== null) {
    throw new Error('QA: el servidor tiene una sesión activa; no interferir.');
  }
  const page = await listExercises(creds.accessToken, { page: 1, pageSize: 100 });
  checkOwner(access, subject);
  const exercise = page.items.find((item) => item.measurement_type === 'reps');
  if (!exercise || !UUID.test(exercise.id)) {
    throw new Error('QA: catálogo remoto no contiene ejercicio válido.');
  }
  await db.runAsync(
    'INSERT OR IGNORE INTO qa_offline_seed (subject, canonical_exercise_id) VALUES (?, ?)',
    subject,
    exercise.id.toLowerCase(),
  );
  checkOwner(access, subject);
  const saved = await readExerciseSeed(access, subject);
  if (!saved || saved !== exercise.id.toLowerCase()) {
    throw new Error('QA: no se ha guardado el ejercicio de forma durable.');
  }
  return saved;
}

/** This phase cannot run through an active USB reverse route to the backend. */
async function proveBackendDisconnected(): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    try {
      // Even an HTTP error counts as REACHABLE: do not mistake airplane+USB
      // for disconnected transport. No auth or workout mutation is sent.
      const response = await requestApi('/health', {
        signal: controller.signal,
      });
      throw new Error(
        'QA bloqueada: el backend sigue accesible (HTTP ' +
          response.status +
          '). Quita solo adb reverse tcp:8001.',
      );
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('QA bloqueada:')) {
        throw error;
      }
      // A fetch failure or timeout is the required disconnected condition.
    }
  } finally {
    clearTimeout(timeout);
  }
}

/** Second step: NO API transport. Persist START, SET, FINISH and three pending rows. */
export async function createOfflineM3Qa(
  access: StartSyncAccess,
): Promise<{ sessionId: string; pending: number }> {
  const subject = subjectFor(access);
  await proveBackendDisconnected();
  checkOwner(access, subject);
  const db = await openOfflineE2eWorkoutDatabase(subject);
  const exerciseId = await readExerciseSeed(access, subject);
  if (!exerciseId) {
    throw new Error('QA: primero prepara el ejercicio mientras hay red.');
  }

  const existing = await listLocalFinishedWorkouts(db, access, { limit: 10 });
  if (existing.length > 1) {
    throw new Error('QA: varias sesiones completadas, no modificar.');
  }
  let sessionId: string;
  if (existing.length === 1) {
    sessionId = existing[0]!.session_id;
  } else {
    let active = await getActiveLocalWorkout(db, access);
    if (!active) {
      active = await beginFreeWorkout(
        db, access, secureWorkoutIds, deviceWorkoutClock,
      );
    }
    sessionId = active.session_id;
    const overview = await readActiveFreeWorkoutOverview(db, access);
    if (!overview || overview.session.session_id !== sessionId) {
      throw new Error('QA: no puede leerse la sesión local.');
    }
    if (overview.totalSets === 0) {
      await recordFreeWorkoutSet(
        db, access, secureWorkoutIds, deviceWorkoutClock,
        {
          canonicalExerciseId: exerciseId,
          role: 'WORKING',
          measurement: { measurementType: 'reps', reps: 8 },
          load: null,
        },
      );
    } else if (overview.totalSets !== 1 || overview.workingSets !== 1) {
      throw new Error('QA: series inesperadas. No duplicar.');
    }
    await endFreeWorkout(db, access, secureWorkoutIds, deviceWorkoutClock);
  }
  checkOwner(access, subject);
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM local_workout_outbox WHERE subject = ? AND session_id = ? AND delivery_state = 'pending'",
    subject, sessionId,
  );
  checkOwner(access, subject);
  if (!row || row.count !== 3) {
    throw new Error('QA: se esperaban exactamente 3 mutaciones pendientes.');
  }
  return { sessionId, pending: row.count };
}

/** Third step, ONLINE: preserve original UUIDs, drain once, prove exactly one remote history row. */
export async function reconcileOfflineM3Qa(
  access: StartSyncAccess,
): Promise<RemoteQaResult> {
  const subject = subjectFor(access);
  await assertIsolatedM3Server(access, subject);
  const db = await openOfflineE2eWorkoutDatabase(subject);
  const existing = await listLocalFinishedWorkouts(db, access, { limit: 10 });
  if (existing.length !== 1 || existing[0]!.working_sets !== 1) {
    throw new Error('QA: falta una única sesión completada offline.');
  }
  return verifyIsolatedM3Finished(
    db, access, subject, existing[0]!.session_id,
  );
}
