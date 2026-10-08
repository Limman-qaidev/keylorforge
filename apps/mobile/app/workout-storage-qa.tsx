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
import { openDiagnosticWorkoutDatabase } from '@/lib/workouts/expo-sqlite-adapter';
import {
  confirmLocalWorkoutSet,
  readLocalConfirmedSet,
  type ConfirmLocalSetInput,
  type LocalPerformedSet,
} from '@/lib/workouts/local-confirmed-sets';
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
  useEffect(() => {
    subjectRef.current = subject;
  }, [subject]);
  const access = useMemo<LocalSubjectAccess>(
    () => ({ currentAuthenticatedSubject: () => subjectRef.current }),
    [],
  );
  const [active, setActive] = useState<LocalWorkoutSession | null>(null);
  const [totalPending, setTotalPending] = useState(0);
  const [firstSet, setFirstSet] = useState<LocalPerformedSet | null>(null);
  const [secondSet, setSecondSet] = useState<LocalPerformedSet | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
      await db.withExclusiveTransactionAsync(async (tx) => {
        if (subjectRef.current !== subject) {
          throw new Error('La cuenta ha cambiado.');
        }
        await tx.runAsync(
          'DELETE FROM local_workout_sets WHERE subject = ?',
          subject.toLowerCase(),
        );
        await tx.runAsync(
          'DELETE FROM local_workout_occurrences WHERE subject = ?',
          subject.toLowerCase(),
        );
        await tx.runAsync(
          'DELETE FROM local_workout_outbox WHERE subject = ?',
          subject.toLowerCase(),
        );
        await tx.runAsync(
          'DELETE FROM local_workout_sessions WHERE subject = ?',
          subject.toLowerCase(),
        );
        if (subjectRef.current !== subject) {
          throw new Error('La cuenta ha cambiado.');
        }
      });
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
        Prueba aislada en el Samsung: no modifica sesiones reales ni envía datos
        al servidor.
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
          <Text style={styles.detail}>
            WARMUP: {firstSet.reps} reps · {firstSet.load_decimal}{' '}
            {firstSet.load_unit} · Polea A
          </Text>
        ) : null}
        {secondSet ? (
          <Text style={styles.detail}>
            WORKING: {secondSet.reps} reps · {secondSet.load_decimal}{' '}
            {secondSet.load_unit} · Polea B
          </Text>
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
