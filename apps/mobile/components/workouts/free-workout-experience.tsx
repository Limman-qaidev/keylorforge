/**
 * M3 native Free Workout draft UX.
 *
 * Not routed to production Entrenar until cancellation and causal outbox
 * draining are ready. No catalogue selection is persisted until the user
 * explicitly confirms a set. All written state uses the real SQLite store.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ExerciseCatalogScreen } from '@/components/exercises/exercise-catalog-screen';
import { useAuth } from '@/lib/auth/auth-provider';
import type { ExerciseDetail } from '@/lib/exercises/catalog-api';
import { useCachedExerciseCatalogue } from '@/lib/exercises/use-cached-exercise-catalogue';
import {
  readActiveFreeWorkoutOverview,
  type ActiveFreeWorkoutOverview,
} from '@/lib/workouts/active-workout-overview';
import {
  beginFreeWorkout,
  cancelFreeWorkout,
  endFreeWorkout,
  recordFreeWorkoutSet,
  type RecordSetRequest,
} from '@/lib/workouts/free-workout-flow';
import {
  listLocalFinishedWorkouts,
  type FinishedWorkoutHistoryEntry,
} from '@/lib/workouts/local-finish-history';
import {
  openLocalWorkoutDatabase,
  openPreviewWorkoutDatabase,
} from '@/lib/workouts/expo-sqlite-adapter';
import { useForegroundWorkoutSync } from '@/lib/workouts/workout-sync-foreground';
import type { LocalSubjectAccess } from '@/lib/workouts/local-store';
import {
  deviceWorkoutClock,
  secureWorkoutIds,
} from '@/lib/workouts/native-workout-platform';

type Mode = 'catalogue' | 'picker' | 'set' | 'history';
type Measurement = 'reps' | 'time' | 'distance';
type Role = 'WORKING' | 'WARMUP';

function Button({
  title,
  onPress,
  disabled,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, secondary && styles.secondaryButton]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryText]}>
        {title}
      </Text>
    </Pressable>
  );
}

function validQuantity(raw: string, measurement: Measurement): number {
  const normalized = raw.trim().replace(',', '.');
  if (measurement === 'distance') {
    if (!/^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,3})?$/.test(normalized)) {
      throw new Error('Introduce una distancia válida.');
    }
    const amount = Number(normalized);
    if (!(amount > 0)) throw new Error('La distancia debe ser positiva.');
    return amount;
  }
  if (!/^[0-9]+$/.test(normalized)) {
    throw new Error('Introduce un número entero positivo.');
  }
  const value = Number(normalized);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Introduce un número entero positivo.');
  }
  return value;
}

export function buildSetRequest(
  exercise: Pick<ExerciseDetail, 'id' | 'measurement_type'>,
  role: Role,
  rawQuantity: string,
  rawLoad: string,
  unit: 'kg' | 'lb',
  distanceUnit: 'm' | 'km',
): RecordSetRequest {
  const measurementType = exercise.measurement_type;
  if (!['reps', 'time', 'distance'].includes(measurementType)) {
    throw new Error('El ejercicio no tiene un tipo de medición compatible.');
  }
  const amount = validQuantity(rawQuantity, measurementType as Measurement);
  const measurement: RecordSetRequest['measurement'] =
    measurementType === 'reps'
      ? { measurementType: 'reps', reps: amount }
      : measurementType === 'time'
        ? { measurementType: 'time', durationSeconds: amount }
        : {
            measurementType: 'distance',
            distanceDecimal: String(amount),
            distanceUnit,
          };
  const raw = rawLoad.trim().replace(',', '.');
  if (
    raw &&
    (measurementType !== 'reps' ||
      !/^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,3})?$/.test(raw))
  ) {
    throw new Error('La carga debe ser un número válido (máximo 3 decimales).');
  }
  return {
    canonicalExerciseId: exercise.id,
    role,
    measurement,
    load: raw ? { decimal: raw, unit, entrySemantics: 'total' } : null,
  };
}

export function FreeWorkoutExperience({
  isolatedPreview = false,
}: {
  isolatedPreview?: boolean;
}) {
  if (isolatedPreview && !__DEV__) {
    throw new Error('Isolated preview must not run in release builds.');
  }
  const { session } = useAuth();
  return (
    <FreeWorkoutSessionExperience
      key={session?.user.id ?? 'signed-out'}
      session={session}
      isolatedPreview={isolatedPreview}
    />
  );
}

function FreeWorkoutSessionExperience({
  session,
  isolatedPreview,
}: {
  session: ReturnType<typeof useAuth>['session'];
  isolatedPreview: boolean;
}) {
  const subject = session?.user.id ?? null;
  // QA sessions must never reach the server or the ordinary workout database.
  const triggerSync = useForegroundWorkoutSync(
    isolatedPreview ? null : subject,
  );
  const subjectRef = useRef<string | null>(null);
  const access = useMemo<LocalSubjectAccess>(
    () => ({ currentAuthenticatedSubject: () => subjectRef.current }),
    [],
  );
  const openDb = useCallback(() => {
    if (!isolatedPreview) return openLocalWorkoutDatabase();
    const authenticatedSubject = subjectRef.current;
    if (!authenticatedSubject) throw new Error('notAuthenticated');
    return openPreviewWorkoutDatabase(authenticatedSubject);
  }, [isolatedPreview]);
  const { snapshot } = useCachedExerciseCatalogue(session);
  const [overview, setOverview] = useState<ActiveFreeWorkoutOverview | null>(
    null,
  );
  const [history, setHistory] = useState<FinishedWorkoutHistoryEntry[]>([]);
  const [mode, setMode] = useState<Mode>('catalogue');
  const [chosen, setChosen] = useState<ExerciseDetail | null>(null);
  const [role, setRole] = useState<Role>('WORKING');
  const [quantity, setQuantity] = useState('');
  const [load, setLoad] = useState('');
  const [unit, setUnit] = useState<'kg' | 'lb'>('kg');
  const [distanceUnit, setDistanceUnit] = useState<'m' | 'km'>('m');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const expectedSubject = subjectRef.current;
    if (!expectedSubject || Platform.OS === 'web') {
      setOverview(null);
      setHistory([]);
      setLoading(false);
      return;
    }
    const db = await openDb();
    const [current, finished] = await Promise.all([
      readActiveFreeWorkoutOverview(db, access),
      listLocalFinishedWorkouts(db, access, { limit: 20 }),
    ]);
    if (subjectRef.current !== expectedSubject) return;
    setOverview(current);
    setHistory(finished);
    setError(null);
    setLoading(false);
  }, [access, openDb]);

  useEffect(() => {
    subjectRef.current = subject;
    let mounted = true;
    void reload().catch((reason: unknown) => {
      if (!mounted) return;
      setError(
        reason instanceof Error ? reason.message : 'No se pudo leer SQLite.',
      );
      setLoading(false);
    });
    return () => {
      mounted = false;
      subjectRef.current = null;
    };
  }, [reload, subject]);

  const perform = async (task: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await task();
      triggerSync();
      await reload();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'No se pudo guardar.',
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const begin = () => {
    void perform(async () => {
      const db = await openDb();
      await beginFreeWorkout(db, access, secureWorkoutIds, deviceWorkoutClock);
      setMode('catalogue');
    });
  };

  const confirmSet = () => {
    if (!chosen) return;
    let request: RecordSetRequest;
    try {
      request = buildSetRequest(
        chosen,
        role,
        quantity,
        load,
        unit,
        distanceUnit,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Serie no válida.');
      return;
    }
    void perform(async () => {
      const db = await openDb();
      await recordFreeWorkoutSet(
        db,
        access,
        secureWorkoutIds,
        deviceWorkoutClock,
        request,
      );
      setChosen(null);
      setQuantity('');
      setLoad('');
      setMode('catalogue');
    });
  };

  const finish = () => {
    if (!overview || overview.workingSets < 1 || busy) return;
    Alert.alert(
      'Finalizar entrenamiento',
      'Se guardarán las series confirmadas en tu historial.',
      [
        { text: 'Seguir entrenando', style: 'cancel' },
        {
          text: 'Finalizar',
          onPress: () => {
            void perform(async () => {
              const db = await openDb();
              await endFreeWorkout(
                db,
                access,
                secureWorkoutIds,
                deviceWorkoutClock,
              );
              setMode('history');
            });
          },
        },
      ],
    );
  };

  const cancel = () => {
    if (!overview || busy) return;
    const hasPerformed = overview.totalSets > 0;
    const cancelConfirmed = () => {
      void perform(async () => {
        const db = await openDb();
        await cancelFreeWorkout(
          db,
          access,
          secureWorkoutIds,
          deviceWorkoutClock,
          hasPerformed,
        );
        setMode('catalogue');
      });
    };
    if (hasPerformed) {
      Alert.alert(
        'Cancelar entrenamiento',
        `Has confirmado ${overview.totalSets} series. Cancelarlo hará que esta sesión no cuente como entrenamiento completado. Las series se conservarán como registro de la cancelación.`,
        [
          { text: 'Seguir entrenando', style: 'cancel' },
          ...(overview.workingSets > 0
            ? [{ text: 'Finalizar en su lugar', onPress: finish }]
            : []),
          {
            text: 'Cancelar igualmente',
            style: 'destructive',
            onPress: cancelConfirmed,
          },
        ],
      );
      return;
    }
    Alert.alert(
      'Cancelar entrenamiento',
      'No hay series confirmadas. ¿Quieres cancelar esta sesión?',
      [
        { text: 'Seguir entrenando', style: 'cancel' },
        {
          text: 'Cancelar',
          style: 'destructive',
          onPress: cancelConfirmed,
        },
      ],
    );
  };

  const choose = (exercise: ExerciseDetail) => {
    setChosen(exercise);
    setRole('WORKING');
    setQuantity('');
    setLoad('');
    setMode('set');
    setError(null);
  };

  const nameOf = (id: string): string =>
    snapshot?.items.find((entry) => entry.id === id)?.name ??
    'Ejercicio no disponible en el catálogo local';

  if (Platform.OS === 'web') {
    return <ExerciseCatalogScreen />;
  }
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator accessibilityLabel="Recuperando entrenamiento" />
        <Text>Recuperando entrenamiento…</Text>
      </View>
    );
  }
  if (error && !overview && mode === 'catalogue') {
    // Read errors fail closed; never offer Start when an active workout may
    // exist but SQLite could not be opened or decrypted.
    return (
      <View style={styles.center}>
        <Text accessibilityLiveRegion="polite">{error}</Text>
        <Button
          title="Reintentar lectura"
          onPress={() => {
            setLoading(true);
            void reload().catch((reason: unknown) => {
              setError(
                reason instanceof Error ? reason.message : 'Error local',
              );
              setLoading(false);
            });
          }}
        />
      </View>
    );
  }

  if (mode === 'picker') {
    return (
      <View style={styles.root}>
        <View style={styles.toolbar}>
          <Button
            title="Volver al entrenamiento"
            secondary
            onPress={() => setMode('catalogue')}
          />
        </View>
        <ExerciseCatalogScreen onChooseExercise={choose} />
      </View>
    );
  }

  if (mode === 'set' && chosen) {
    const measurement = chosen.measurement_type as Measurement;
    return (
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>REGISTRAR SERIE</Text>
        <Text accessibilityRole="header" style={styles.heading}>
          {chosen.name}
        </Text>
        <Text style={styles.caption}>
          La serie solo se guarda cuando pulses «Confirmar serie».
        </Text>
        <Text style={styles.label}>Tipo de serie</Text>
        <View style={styles.inline}>
          <Button
            title="Trabajo"
            secondary={role !== 'WORKING'}
            onPress={() => setRole('WORKING')}
          />
          <Button
            title="Calentamiento"
            secondary={role !== 'WARMUP'}
            onPress={() => setRole('WARMUP')}
          />
        </View>
        <Text style={styles.label}>
          {measurement === 'time'
            ? 'Duración (segundos)'
            : measurement === 'distance'
              ? 'Distancia'
              : 'Repeticiones'}
        </Text>
        <TextInput
          accessibilityLabel="Cantidad realizada"
          keyboardType="decimal-pad"
          onChangeText={setQuantity}
          placeholder="Cantidad realizada"
          style={styles.input}
          value={quantity}
        />
        {measurement === 'distance' ? (
          <View style={styles.inline}>
            <Button
              title="Metros"
              secondary={distanceUnit !== 'm'}
              onPress={() => setDistanceUnit('m')}
            />
            <Button
              title="Kilómetros"
              secondary={distanceUnit !== 'km'}
              onPress={() => setDistanceUnit('km')}
            />
          </View>
        ) : null}
        {measurement === 'reps' ? (
          <>
            <Text style={styles.label}>Carga total (opcional)</Text>
            <TextInput
              accessibilityLabel="Carga total opcional"
              keyboardType="decimal-pad"
              onChangeText={setLoad}
              placeholder="Sin carga"
              style={styles.input}
              value={load}
            />
            <View style={styles.inline}>
              <Button
                title="kg"
                secondary={unit !== 'kg'}
                onPress={() => setUnit('kg')}
              />
              <Button
                title="lb"
                secondary={unit !== 'lb'}
                onPress={() => setUnit('lb')}
              />
            </View>
          </>
        ) : null}
        {error ? (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {error}
          </Text>
        ) : null}
        <Button
          title={busy ? 'Guardando…' : 'Confirmar serie'}
          onPress={confirmSet}
          disabled={busy}
        />
        <Button
          title="Volver sin guardar"
          secondary
          disabled={busy}
          onPress={() => {
            setChosen(null);
            setMode('picker');
          }}
        />
      </ScrollView>
    );
  }

  if (mode === 'history') {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.eyebrow}>MIS ENTRENAMIENTOS</Text>
        <Text accessibilityRole="header" style={styles.heading}>
          Historial
        </Text>
        {history.map((item) => (
          <View key={item.session_id} style={styles.item}>
            <Text style={styles.itemTitle}>{item.local_date}</Text>
            <Text>
              {item.total_sets} series · {item.working_sets} de trabajo
            </Text>
          </View>
        ))}
        {history.length === 0 ? (
          <Text>Todavía no hay entrenamientos finalizados.</Text>
        ) : null}
        <Button
          title={overview ? 'Volver al entrenamiento' : 'Volver a Entrenar'}
          secondary
          onPress={() => setMode('catalogue')}
        />
      </ScrollView>
    );
  }

  if (overview) {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.eyebrow}>KEYLORFORGE · ENTRENAR</Text>
        <Text accessibilityRole="header" style={styles.heading}>
          Entrenamiento activo
        </Text>
        <Text style={styles.caption}>
          {overview.totalSets} series confirmadas
        </Text>
        {overview.exercises.map((entry) => (
          <View key={entry.occurrence_id} style={styles.item}>
            <Text style={styles.itemTitle}>
              {nameOf(entry.canonical_exercise_id)}
            </Text>
            {entry.sets.map((set, index) => (
              <Text key={set.set_id} style={styles.caption}>
                {index + 1}.{' '}
                {set.set_role === 'WORKING' ? 'Trabajo' : 'Calentamiento'} ·{' '}
                {set.measurement_type === 'reps'
                  ? `${set.reps} rep`
                  : set.measurement_type === 'time'
                    ? `${set.duration_seconds} s`
                    : `${set.distance_decimal} ${set.distance_unit}`}
                {set.load_decimal !== null
                  ? ` · ${set.load_decimal} ${set.load_unit}`
                  : ''}
              </Text>
            ))}
          </View>
        ))}
        {overview.exercises.length === 0 ? (
          <Text style={styles.caption}>
            Elige un ejercicio y confirma tu primera serie.
          </Text>
        ) : null}
        {error ? (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {error}
          </Text>
        ) : null}
        <Button
          title="Añadir ejercicio o serie"
          disabled={busy}
          onPress={() => setMode('picker')}
        />
        <Button
          title="Ver historial"
          secondary
          disabled={busy}
          onPress={() => setMode('history')}
        />
        <Button
          title="Finalizar entrenamiento"
          secondary
          disabled={busy || overview.workingSets < 1}
          onPress={finish}
        />
        <Button
          title="Cancelar entrenamiento"
          secondary
          disabled={busy}
          onPress={cancel}
        />
        {overview.workingSets === 0 ? (
          <Text style={styles.caption}>
            Necesitas confirmar al menos una serie de trabajo para finalizar.
          </Text>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Button
          title="Iniciar entrenamiento libre"
          onPress={begin}
          disabled={busy}
        />
        {history.length > 0 ? (
          <Button
            title="Historial"
            secondary
            onPress={() => setMode('history')}
          />
        ) : null}
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <ExerciseCatalogScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f6f8fc' },
  page: { padding: 20, paddingBottom: 64, gap: 12 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  toolbar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  button: {
    backgroundColor: '#075bff',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#ffffff', fontWeight: '700' },
  secondaryButton: { backgroundColor: '#e7efff' },
  secondaryText: { color: '#075bff' },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: '#526074',
    letterSpacing: 1,
  },
  heading: { fontSize: 26, fontWeight: '800', color: '#12213a' },
  label: { fontWeight: '700', fontSize: 15, color: '#12213a', marginTop: 8 },
  caption: { fontSize: 14, color: '#54657e', lineHeight: 22 },
  error: { color: '#b42318', fontSize: 14, padding: 12 },
  inline: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd6e4',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: 17,
  },
  item: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#fff',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e8edf5',
  },
  itemTitle: { fontWeight: '700', fontSize: 17, color: '#12213a' },
});
