/**
 * Development-only physical Android acceptance surface for M3-MOB-001/002.
 * It exclusively uses an isolated SQLite database, never the product store.
 * These diagnostic mutations are intentionally NOT synced to FastAPI.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { RequireAuthenticated } from '@/components/auth/auth-guards';
import { AuthenticatedShell } from '@/components/navigation/authenticated-shell';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  offlineCatalogueStatus,
  searchOfflineExercises,
  seedOfflineCatalogueFromApi,
  type CachedCatalogueStatus,
} from '@/lib/exercises/offline-catalogue';
import { openOfflineExerciseCatalogue } from '@/lib/exercises/offline-catalogue-adapter';
import type { StartSyncAccess } from '@/lib/workouts/start-session-sync';
import { openDiagnosticWorkoutDatabase } from '@/lib/workouts/expo-sqlite-adapter';
import {
  confirmLocalWorkoutSet,
  readLocalConfirmedSet,
  type ConfirmLocalSetInput,
  type LocalPerformedSet,
} from '@/lib/workouts/local-confirmed-sets';
import {
  resetDiagnosticSubjectData,
  verifyPersistedDiagnosticMachine,
} from '@/lib/workouts/workout-storage-qa-utils';
import {
  getActiveLocalWorkout,
  startLocalFreeWorkout,
  type LocalStartWorkoutInput,
  type LocalWorkoutSession,
  type LocalSubjectAccess,
} from '@/lib/workouts/local-store';

const QA_SESSION_UUID = 'b35c00d6-243c-4dea-a095-000000000132';
const QA_MUTATION_UUID = 'b35c00d6-243c-4dea-a095-000000000133';
const QA_EXERCISE_UUID = 'b35c00d6-243c-4dea-a095-000000000140';
const QA_OCCURRENCE_UUID = 'b35c00d6-243c-4dea-a095-000000000141';
const QA_FIRST_SET_UUID = 'b35c00d6-243c-4dea-a095-000000000142';
const QA_FIRST_MUTATION_UUID = 'b35c00d6-243c-4dea-a095-000000000143';
const QA_SECOND_SET_UUID = 'b35c00d6-243c-4dea-a095-000000000144';
const QA_SECOND_MUTATION_UUID = 'b35c00d6-243c-4dea-a095-000000000145';
const QA_MACHINE_A_UUID = 'b35c00d6-243c-4dea-a095-000000000146';
const QA_MACHINE_B_UUID = 'b35c00d6-243c-4dea-a095-000000000147';

function diagnosticPerformedInput(
  second: boolean,
  startedAtUtc: string,
): ConfirmLocalSetInput {
  return {
    sessionId: QA_SESSION_UUID,
    mutationId: second ? QA_SECOND_MUTATION_UUID : QA_FIRST_MUTATION_UUID,
    setId: second ? QA_SECOND_SET_UUID : QA_FIRST_SET_UUID,
    occurrenceId: QA_OCCURRENCE_UUID,
    // A disposable diagnostic identity, deliberately NEVER synced or sent
    // to an authoritative exercise-catalogue endpoint.
    canonicalExerciseId: QA_EXERCISE_UUID,
    actualOrder: 0,
    firstSet: !second,
    setRole: second ? 'WORKING' : 'WARMUP',
    measurement: {
      measurementType: 'reps',
      reps: second ? 8 : 12,
    },
    load: {
      decimal: second ? '27.5' : '20.5',
      unit: second ? 'lb' : 'kg',
      entrySemantics: 'machine_display',
    },
    machine: {
      profileId: second ? QA_MACHINE_B_UUID : QA_MACHINE_A_UUID,
      snapshot: { label: second ? 'Polea B (QA)' : 'Polea A (QA)' },
    },
    targetAtConfirmation: null,
    // Stable diagnostic timestamp across retries of the same mutation ID.
    completedAtUtc: new Date(
      new Date(startedAtUtc).getTime() + (second ? 2 : 1) * 60_000,
    ).toISOString(),
  };
}

function currentStartInput(): LocalStartWorkoutInput {
  const instant = new Date();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const hour = Number(values.hour);
  const minute = Number(values.minute);
  const second = Number(values.second);
  const localDate = [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
  const localSecond = Date.UTC(year, month - 1, day, hour, minute, second);
  const utcSecond = Date.UTC(
    instant.getUTCFullYear(),
    instant.getUTCMonth(),
    instant.getUTCDate(),
    instant.getUTCHours(),
    instant.getUTCMinutes(),
    instant.getUTCSeconds(),
  );
  return {
    sessionId: QA_SESSION_UUID,
    mutationId: QA_MUTATION_UUID,
    startedAtUtc: instant.toISOString(),
    timeZone: zone,
    utcOffsetMinutes: Math.floor((localSecond - utcSecond) / 60_000),
    localDate,
  };
}

function StorageDiagnosticScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const subject = session?.user.id ?? null;
  const subjectRef = useRef(subject);
  const sessionRef = useRef(session);
  useEffect(() => {
    subjectRef.current = subject;
    sessionRef.current = session;
  }, [subject, session]);
  const access = useMemo<LocalSubjectAccess>(
    () => ({ currentAuthenticatedSubject: () => subjectRef.current }),
    [],
  );
  const catalogueAccess = useMemo<StartSyncAccess>(
    () => ({
      currentAuthenticatedSubject: () => subjectRef.current,
      acquireCurrentCredentials: async () => {
        const current = sessionRef.current;
        return current?.user.id && current.access_token
          ? { subject: current.user.id, accessToken: current.access_token }
          : null;
      },
    }),
    [],
  );
  const [cacheStatus, setCacheStatus] = useState<CachedCatalogueStatus>({
    state: 'unseeded',
  });
  const [cacheFeedback, setCacheFeedback] = useState<string | null>(null);
  const [active, setActive] = useState<LocalWorkoutSession | null>(null);
  const [totalPending, setTotalPending] = useState(0);
  const [firstSet, setFirstSet] = useState<LocalPerformedSet | null>(null);
  const [secondSet, setSecondSet] = useState<LocalPerformedSet | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const firstMachine = firstSet
    ? verifyPersistedDiagnosticMachine(
        firstSet,
        QA_MACHINE_A_UUID,
        'Polea A (QA)',
      )
    : null;
  const secondMachine = secondSet
    ? verifyPersistedDiagnosticMachine(
        secondSet,
        QA_MACHINE_B_UUID,
        'Polea B (QA)',
      )
    : null;

  const refresh = useCallback(async () => {
    if (!subject) {
      return;
    }
    const db = await openDiagnosticWorkoutDatabase(subject);
    const current = await getActiveLocalWorkout(db, access);
    const count = await db.getFirstAsync<{ total: number }>(
      "SELECT COUNT(*) AS total FROM local_workout_outbox WHERE subject = ? AND delivery_state = 'pending'",
      subject.toLowerCase(),
    );
    const initialSet = await readLocalConfirmedSet(
      db,
      access,
      QA_FIRST_SET_UUID,
    );
    const subsequentSet = await readLocalConfirmedSet(
      db,
      access,
      QA_SECOND_SET_UUID,
    );
    if (subjectRef.current === subject) {
      setActive(current);
      setTotalPending(count?.total ?? 0);
      setFirstSet(initialSet);
      setSecondSet(subsequentSet);
    }
  }, [access, subject]);

  useEffect(() => {
    let mounted = true;
    void refresh().catch((error: unknown) => {
      if (mounted) {
        setMessage(error instanceof Error ? error.message : 'Error de SQLite.');
      }
    });
    return () => {
      mounted = false;
    };
  }, [refresh]);

  useEffect(() => {
    let mounted = true;
    void openOfflineExerciseCatalogue()
      .then(offlineCatalogueStatus)
      .then((status) => {
        if (mounted) setCacheStatus(status);
      })
      .catch((error: unknown) => {
        if (mounted) {
          setCacheFeedback(
            error instanceof Error ? error.message : 'Error de la caché.',
          );
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const onDownloadCache = async () => {
    setBusy(true);
    setCacheFeedback(null);
    try {
      const db = await openOfflineExerciseCatalogue();
      const status = await seedOfflineCatalogueFromApi(db, catalogueAccess);
      setCacheStatus(status);
      setCacheFeedback('Catálogo completo descargado y guardado en SQLite.');
    } catch (error) {
      setCacheFeedback(
        error instanceof Error ? error.message : 'Error de descarga.',
      );
    } finally {
      setBusy(false);
    }
  };

  const onReadCache = async () => {
    setBusy(true);
    setCacheFeedback(null);
    try {
      const db = await openOfflineExerciseCatalogue();
      const status = await offlineCatalogueStatus(db);
      const result = await searchOfflineExercises(db, { limit: 1 });
      setCacheStatus(status);
      setCacheFeedback(
        status.state === 'ready'
          ? `Lectura LOCAL: ${result.total} ejercicios. Ejemplo: ${result.items[0]?.name ?? 'sin registros'}.`
          : 'Sin catálogo descargado. La lectura no utiliza red.',
      );
    } catch (error) {
      setCacheFeedback(
        error instanceof Error ? error.message : 'Error al leer.',
      );
    } finally {
      setBusy(false);
    }
  };

  const onStart = async () => {
    if (!subject) {
      setMessage('Debes iniciar sesión antes de la prueba.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const db = await openDiagnosticWorkoutDatabase(subject);
      await startLocalFreeWorkout(db, access, currentStartInput());
      await refresh();
      setMessage(
        'Sesión y outbox guardados de forma local. Sin enviar a la API.',
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No se pudo guardar.',
      );
    } finally {
      setBusy(false);
    }
  };

  const onConfirmSet = async (second: boolean) => {
    if (!subject || !active) {
      setMessage('Primero hay que crear una sesión local.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const db = await openDiagnosticWorkoutDatabase(subject);
      await confirmLocalWorkoutSet(
        db,
        access,
        diagnosticPerformedInput(second, active.started_at_utc),
      );
      await refresh();
      setMessage(
        second
          ? 'Serie WORKING y máquina B guardadas en SQLite.'
          : 'Primera serie WARMUP + ocurrencia guardadas juntas en SQLite.',
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No se pudo confirmar.',
      );
    } finally {
      setBusy(false);
    }
  };

  const onRefresh = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await refresh();
      setMessage('Datos leídos directamente de SQLite.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo leer.');
    } finally {
      setBusy(false);
    }
  };

  const resetOnlyDiagnosticData = async () => {
    if (!subject) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const db = await openDiagnosticWorkoutDatabase(subject);
      await resetDiagnosticSubjectData(db, access, subject);
      await refresh();
      setMessage('Borrados solo los datos de la base de diagnóstico.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error de SQLite.');
    } finally {
      setBusy(false);
    }
  };

  const onReset = () => {
    Alert.alert(
      'Vaciar prueba SQLite',
      'Solo se borrarán sesiones de la base de diagnóstico. No afecta al catálogo ni a entrenamientos reales.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Vaciar prueba',
          style: 'destructive',
          onPress: () => void resetOnlyDiagnosticData(),
        },
      ],
    );
  };

  if (!__DEV__) {
    return (
      <View style={styles.container}>
        <Text style={styles.description}>Diagnóstico no disponible.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.heading}>
        M3 · Diagnóstico SQLite
      </Text>
      <Text style={styles.description}>
        Las pruebas de sesiones no modifican entrenamientos reales ni se
        sincronizan. Solo la descarga voluntaria del catálogo consulta la API.
      </Text>
      <View style={styles.panel}>
        <Text style={styles.label}>ESTADO LOCAL</Text>
        <Text testID="qa-session-state" style={styles.value}>
          {active ? 'SESIÓN ACTIVA' : 'SIN SESIÓN'}
        </Text>
        <Text testID="qa-pending-state" style={styles.detail}>
          Operaciones pendientes (cola local): {totalPending}
        </Text>
        {active ? (
          <Text selectable style={styles.detail}>
            Sesión: {active.session_id}
            {'\n'}Fecha: {active.local_date}
            {'\n'}Inicio UTC: {active.started_at_utc}
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={busy || Boolean(active)}
        onPress={() => void onStart()}
        style={[styles.button, (busy || active) && styles.disabled]}
      >
        <Text style={styles.buttonText}>Crear sesión LOCAL de prueba</Text>
      </Pressable>
      <View style={styles.panel}>
        <Text style={styles.label}>SERIES CONFIRMADAS · QA</Text>
        <Text testID="qa-confirmed-set-count" style={styles.value}>
          {(firstSet ? 1 : 0) + (secondSet ? 1 : 0)} serie(s)
        </Text>
        {firstSet ? (
          <View testID="qa-first-set-persisted">
            <Text style={styles.detail}>
              WARMUP: {firstSet.reps} reps · {firstSet.load_decimal}{' '}
              {firstSet.load_unit}
            </Text>
            <Text style={styles.detail}>
              Máquina (SQLite): {firstMachine?.label}
            </Text>
            <Text style={styles.detail}>
              Perfil (SQLite): {firstMachine?.profileId}
            </Text>
            <Text style={styles.detail}>
              {firstMachine?.matchesExpected
                ? 'CONTEXTO MÁQUINA A VERIFICADO'
                : 'ERROR: CONTEXTO MÁQUINA A NO COINCIDE'}
            </Text>
          </View>
        ) : null}
        {secondSet ? (
          <View testID="qa-second-set-persisted">
            <Text style={styles.detail}>
              WORKING: {secondSet.reps} reps · {secondSet.load_decimal}{' '}
              {secondSet.load_unit}
            </Text>
            <Text style={styles.detail}>
              Máquina (SQLite): {secondMachine?.label}
            </Text>
            <Text style={styles.detail}>
              Perfil (SQLite): {secondMachine?.profileId}
            </Text>
            <Text style={styles.detail}>
              {secondMachine?.matchesExpected
                ? 'CONTEXTO MÁQUINA B VERIFICADO'
                : 'ERROR: CONTEXTO MÁQUINA B NO COINCIDE'}
            </Text>
          </View>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={busy || !active || Boolean(firstSet)}
        onPress={() => void onConfirmSet(false)}
        style={[
          styles.button,
          (busy || !active || firstSet) && styles.disabled,
        ]}
      >
        <Text style={styles.buttonText}>
          Confirmar 1.ª serie WARMUP (20,5 kg · Polea A)
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={busy || !active || !firstSet || Boolean(secondSet)}
        onPress={() => void onConfirmSet(true)}
        style={[
          styles.button,
          (busy || !active || !firstSet || secondSet) && styles.disabled,
        ]}
      >
        <Text style={styles.buttonText}>
          Confirmar 2.ª serie WORKING (27,5 lb · Polea B)
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void onRefresh()}
        style={styles.secondary}
      >
        <Text style={styles.secondaryText}>Volver a leer SQLite</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={onReset}
        style={styles.secondary}
      >
        <Text style={styles.secondaryText}>Vaciar solo esta prueba</Text>
      </Pressable>
      <View style={styles.panel}>
        <Text style={styles.label}>CATÁLOGO OFFLINE · M3-MOB-008</Text>
        <Text style={styles.detail}>
          Base SQLite pública de ejercicios, independiente de las sesiones y
          series. Descargar requiere conexión; leer no utiliza la red.
        </Text>
        <Text testID="qa-catalogue-cache-status" style={styles.value}>
          {cacheStatus.state === 'ready'
            ? `CACHÉ COMPLETA · ${cacheStatus.total}`
            : 'SIN CACHÉ'}
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void onDownloadCache()}
          style={[styles.button, busy && styles.disabled]}
        >
          <Text style={styles.buttonText}>
            Descargar catálogo completo (API)
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void onReadCache()}
          style={[styles.secondary, busy && styles.disabled]}
        >
          <Text style={styles.secondaryText}>
            Leer catálogo en SQLite (sin red)
          </Text>
        </Pressable>
        {cacheFeedback ? (
          <Text testID="qa-catalogue-cache-feedback" style={styles.detail}>
            {cacheFeedback}
          </Text>
        ) : null}
      </View>
      {message ? (
        <Text
          accessibilityLiveRegion="polite"
          testID="qa-feedback"
          style={styles.message}
        >
          {message}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.replace('/train')}
        style={styles.back}
      >
        <Text style={styles.secondaryText}>Volver a Entrenar</Text>
      </Pressable>
    </ScrollView>
  );
}

export default function WorkoutStorageQaRoute() {
  return (
    <RequireAuthenticated>
      <AuthenticatedShell activeDestination="train">
        <StorageDiagnosticScreen />
      </AuthenticatedShell>
    </RequireAuthenticated>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#f6f8fc', flex: 1 },
  content: { gap: 14, padding: 24, paddingBottom: 40 },
  heading: { color: '#12213a', fontSize: 24, fontWeight: '800' },
  description: { color: '#526074', fontSize: 14, lineHeight: 21 },
  panel: { backgroundColor: '#fff', borderRadius: 15, padding: 20, gap: 8 },
  label: { color: '#536880', fontSize: 12, fontWeight: '800' },
  value: { color: '#12213a', fontSize: 22, fontWeight: '800' },
  detail: { color: '#31435f', fontSize: 13, lineHeight: 20 },
  button: {
    alignItems: 'center',
    backgroundColor: '#075bff',
    borderRadius: 12,
    padding: 16,
  },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondary: { backgroundColor: '#e6ecf6', borderRadius: 12, padding: 14 },
  secondaryText: {
    color: '#243858',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: { color: '#243858', fontSize: 13, lineHeight: 20 },
  back: { padding: 12 },
});
