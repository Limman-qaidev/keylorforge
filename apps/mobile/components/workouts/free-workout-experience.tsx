/**
 * M3 native Free Workout draft UX.
 *
 * Not routed to production Entrenar until cancellation and causal outbox
 * draining are ready. No catalogue selection is persisted until the user
 * explicitly confirms a set. All written state uses the real SQLite store.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ExerciseCatalogScreen } from '@/components/exercises/exercise-catalog-screen';
import {
  ActiveWorkoutV2,
  ExercisePickerV2,
  RegisterSetV2,
  WorkoutHistoryDetailV2,
  WorkoutHistoryV2,
  WorkoutHubV2,
} from '@/components/workouts/workout-v2-screens';
import { useAuth } from '@/lib/auth/auth-provider';
import type { ExerciseDetail } from '@/lib/exercises/catalog-api';
import { useCachedExerciseCatalogue } from '@/lib/exercises/use-cached-exercise-catalogue';
import {
  readActiveFreeWorkoutOverview,
  type ActiveFreeWorkoutOverview,
  type ActiveExerciseSummary,
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
  readLocalFinishedWorkoutDetail,
  type FinishedWorkoutDetail,
  type FinishedWorkoutHistoryEntry,
} from '@/lib/workouts/local-finish-history';
import {
  openLocalWorkoutDatabase,
  openPreviewWorkoutDatabase,
} from '@/lib/workouts/expo-sqlite-adapter';
import { useForegroundWorkoutSync } from '@/lib/workouts/workout-sync-foreground';
import {
  latestConfirmedSet,
  remainingRestSeconds,
  REST_PRESETS_SECONDS,
  type RestPresetSeconds,
} from '@/lib/workouts/rest-timer';
import type { LocalSubjectAccess } from '@/lib/workouts/local-store';
import {
  readLastCompletedExercisePerformance,
  type LastExercisePerformance,
} from '@/lib/workouts/last-exercise-performance';
import {
  deviceWorkoutClock,
  secureWorkoutIds,
} from '@/lib/workouts/native-workout-platform';

type Mode =
  'catalogue' | 'explore' | 'picker' | 'set' | 'history' | 'history-detail';
type Measurement = 'reps' | 'time' | 'distance';
type Role = 'WORKING' | 'WARMUP';

export type WorkoutChrome = {
  immersive: boolean;
  dark: boolean;
};

type RestControl = {
  sessionId: string;
  setId: string;
  adjustmentSeconds: number;
  dismissed: boolean;
};

function Button({
  title,
  onPress,
  disabled,
  secondary = false,
  dark = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  dark?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        secondary && styles.secondaryButton,
        dark && secondary && styles.secondaryButtonDark,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          secondary && styles.secondaryText,
          dark && secondary && styles.secondaryTextDark,
        ]}
      >
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
  initialMode = 'catalogue',
  onChromeChange,
}: {
  isolatedPreview?: boolean;
  initialMode?: 'catalogue' | 'history';
  onChromeChange?: (chrome: WorkoutChrome) => void;
}) {
  if (isolatedPreview && !__DEV__) {
    throw new Error('Isolated preview must not run in release builds.');
  }
  const { session } = useAuth();
  return (
    <FreeWorkoutSessionExperience
      key={`${session?.user.id ?? 'signed-out'}:${initialMode}`}
      session={session}
      isolatedPreview={isolatedPreview}
      initialMode={initialMode}
      onChromeChange={onChromeChange}
    />
  );
}

function FreeWorkoutSessionExperience({
  session,
  isolatedPreview,
  initialMode,
  onChromeChange,
}: {
  session: ReturnType<typeof useAuth>['session'];
  isolatedPreview: boolean;
  initialMode: 'catalogue' | 'history';
  onChromeChange?: (chrome: WorkoutChrome) => void;
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
  const [mode, setMode] = useState<Mode>(initialMode);
  const hasActiveWorkout = overview !== null;
  const immersive = hasActiveWorkout || mode !== 'catalogue';
  const darkChrome =
    mode === 'set' || (hasActiveWorkout && mode === 'catalogue');
  useEffect(() => {
    onChromeChange?.({ immersive, dark: darkChrome });
  }, [onChromeChange, immersive, darkChrome]);

  useEffect(
    () => () => onChromeChange?.({ immersive: false, dark: false }),
    [onChromeChange],
  );
  const [selectedHistory, setSelectedHistory] =
    useState<FinishedWorkoutHistoryEntry | null>(null);
  const [historyDetail, setHistoryDetail] =
    useState<FinishedWorkoutDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Pick<
    ExerciseDetail,
    'id' | 'name' | 'measurement_type'
  > | null>(null);
  const [focusedExerciseId, setFocusedExerciseId] = useState<string | null>(
    null,
  );
  const [role, setRole] = useState<Role>('WORKING');
  const [quantity, setQuantity] = useState('');
  const [load, setLoad] = useState('');
  const [previousPerformance, setPreviousPerformance] =
    useState<LastExercisePerformance | null>(null);
  const [previousLookupError, setPreviousLookupError] = useState(false);
  const selectionRequest = useRef(0);
  const [unit, setUnit] = useState<'kg' | 'lb'>('kg');
  const [distanceUnit, setDistanceUnit] = useState<'m' | 'km'>('m');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [restSeconds, setRestSeconds] = useState<RestPresetSeconds>(90);
  const [restControl, setRestControl] = useState<RestControl | null>(null);
  const [clockMilliseconds, setClockMilliseconds] = useState<number>(0);

  // Settings are local, scoped to the authenticated subject, and never synced
  // with workout data. Only a confirmed set timestamp starts the countdown.
  useEffect(() => {
    if (!subject) return;
    let live = true;
    void Promise.all([
      AsyncStorage.getItem(`keylorforge:rest:preset:v1:${subject}`),
      AsyncStorage.getItem(`keylorforge:rest:control:v1:${subject}`),
    ])
      .then(([preset, control]) => {
        if (!live) return;
        const seconds = Number(preset);
        if (
          preset !== null &&
          REST_PRESETS_SECONDS.some((item) => item === seconds)
        ) {
          setRestSeconds(seconds as RestPresetSeconds);
        }
        if (control) {
          try {
            const stored: unknown = JSON.parse(control);
            if (
              stored &&
              typeof stored === 'object' &&
              'sessionId' in stored &&
              'setId' in stored &&
              'adjustmentSeconds' in stored &&
              'dismissed' in stored
            ) {
              const value = stored as RestControl;
              if (
                typeof value.sessionId === 'string' &&
                typeof value.setId === 'string' &&
                Number.isInteger(value.adjustmentSeconds) &&
                Math.abs(value.adjustmentSeconds) <= 3600 &&
                typeof value.dismissed === 'boolean'
              ) {
                setRestControl(value);
              }
            }
          } catch {
            // Invalid optional rest UI metadata does not affect workout records.
          }
        }
      })
      .catch(() => {
        // Rest preferences are optional; confirmed set data remains authoritative.
      });
    return () => {
      live = false;
    };
  }, [subject]);

  const activeSessionId = overview?.session.session_id;
  useEffect(() => {
    if (!activeSessionId) return;
    const tick = () => setClockMilliseconds(Date.now());
    const initialTick = setTimeout(tick, 0);
    const ticker = setInterval(tick, 1000);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      clearTimeout(initialTick);
      clearInterval(ticker);
      appState.remove();
    };
  }, [activeSessionId]);

  const recentSet = latestConfirmedSet(overview);
  const currentControl =
    restControl?.sessionId === overview?.session.session_id &&
    restControl?.setId === recentSet?.set_id
      ? restControl
      : null;
  const remainingRest =
    currentControl?.dismissed || clockMilliseconds === 0
      ? 0
      : remainingRestSeconds(
          recentSet,
          restSeconds,
          clockMilliseconds,
          currentControl?.adjustmentSeconds ?? 0,
        );

  const saveRestControl = (value: RestControl) => {
    setRestControl(value);
    if (subject) {
      void AsyncStorage.setItem(
        `keylorforge:rest:control:v1:${subject}`,
        JSON.stringify(value),
      ).catch(() => {});
    }
  };

  const adjustRest = (seconds: number) => {
    if (!overview || !recentSet || remainingRest === 0) return;
    saveRestControl({
      sessionId: overview.session.session_id,
      setId: recentSet.set_id,
      adjustmentSeconds: Math.max(
        -3600,
        Math.min(3600, (currentControl?.adjustmentSeconds ?? 0) + seconds),
      ),
      dismissed: false,
    });
    setClockMilliseconds(Date.now());
  };

  const dismissRest = () => {
    if (!overview || !recentSet) return;
    saveRestControl({
      sessionId: overview.session.session_id,
      setId: recentSet.set_id,
      adjustmentSeconds: currentControl?.adjustmentSeconds ?? 0,
      dismissed: true,
    });
  };

  const selectRestSeconds = (seconds: RestPresetSeconds) => {
    setRestSeconds(seconds);
    setClockMilliseconds(Date.now());
    if (subject) {
      void AsyncStorage.setItem(
        `keylorforge:rest:preset:v1:${subject}`,
        String(seconds),
      ).catch(() => {});
    }
  };

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
      // Keep exercise context. The engine reuses its canonical occurrence.
      // Returning to the active workout does not reopen the catalogue.
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

  const openHistoryDetail = (item: FinishedWorkoutHistoryEntry) => {
    const expectedSubject = subjectRef.current;
    setSelectedHistory(item);
    setHistoryDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    setMode('history-detail');
    void (async () => {
      const db = await openDb();
      const result = await readLocalFinishedWorkoutDetail(db, access, item);
      if (subjectRef.current === expectedSubject) {
        setHistoryDetail(result);
      }
    })()
      .catch((reason: unknown) => {
        if (subjectRef.current === expectedSubject) {
          setDetailError(
            reason instanceof Error
              ? reason.message
              : 'No se pudo abrir el entrenamiento.',
          );
        }
      })
      .finally(() => {
        if (subjectRef.current === expectedSubject) setDetailLoading(false);
      });
  };

  const addSetToExercise = (exercise: ActiveExerciseSummary) => {
    ++selectionRequest.current;
    setPreviousPerformance(null);
    setPreviousLookupError(false);
    setFocusedExerciseId(exercise.canonical_exercise_id);
    const previous = exercise.sets[exercise.sets.length - 1];
    if (!previous) return;
    const cached = snapshot?.items.find(
      (item) => item.id === exercise.canonical_exercise_id,
    );
    setChosen({
      id: exercise.canonical_exercise_id,
      name: cached?.name ?? 'Ejercicio registrado',
      measurement_type: previous.measurement_type,
    });
    setRole(previous.set_role);
    setQuantity(
      previous.measurement_type === 'reps'
        ? String(previous.reps ?? '')
        : previous.measurement_type === 'time'
          ? String(previous.duration_seconds ?? '')
          : String(previous.distance_decimal ?? ''),
    );
    setLoad(previous.load_decimal ?? '');
    setUnit(previous.load_unit === 'lb' ? 'lb' : 'kg');
    setDistanceUnit(previous.distance_unit === 'km' ? 'km' : 'm');
    setError(null);
    setMode('set');
  };

  const choose = (
    exercise: Pick<ExerciseDetail, 'id' | 'name' | 'measurement_type'>,
  ) => {
    const requestId = ++selectionRequest.current;
    const selectedSubject = subjectRef.current;
    setFocusedExerciseId(exercise.id);
    setChosen(exercise);
    setRole('WORKING');
    setQuantity('');
    setLoad('');
    setPreviousPerformance(null);
    setPreviousLookupError(false);
    setError(null);
    // Read completed, confirmed WORKING sets only. Never derive a prescription.
    // Keep the picker while the local query completes so typing cannot be
    // overwritten by a late historical result.
    void (async () => {
      try {
        const db = await openDb();
        const prior = await readLastCompletedExercisePerformance(
          db,
          access,
          exercise.id,
        );
        if (
          selectionRequest.current !== requestId ||
          subjectRef.current !== selectedSubject
        ) return;
        if (prior && prior.measurement_type === exercise.measurement_type) {
          setPreviousPerformance(prior);
          setQuantity(
            prior.measurement_type === 'reps'
              ? String(prior.reps ?? '')
              : prior.measurement_type === 'time'
                ? String(prior.duration_seconds ?? '')
                : String(prior.distance_decimal ?? ''),
          );
          setLoad(prior.load_decimal ?? '');
          setUnit(prior.load_unit === 'lb' ? 'lb' : 'kg');
          setDistanceUnit(prior.distance_unit === 'km' ? 'km' : 'm');
        }
      } catch {
        if (
          selectionRequest.current === requestId &&
          subjectRef.current === selectedSubject
        ) setPreviousLookupError(true);
      } finally {
        if (
          selectionRequest.current === requestId &&
          subjectRef.current === selectedSubject
        ) setMode('set');
      }
    })();
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

  if (mode === 'explore') {
    return (
      <ExercisePickerV2
        title="Explorar ejercicios"
        onBack={() => setMode('catalogue')}
      >
        <ExerciseCatalogScreen />
      </ExercisePickerV2>
    );
  }

  if (mode === 'picker') {
    return (
      <ExercisePickerV2 onBack={() => setMode('catalogue')}>
        <ExerciseCatalogScreen onChooseExercise={choose} compact />
      </ExercisePickerV2>
    );
  }

  if (mode === 'set' && chosen) {
    return (
      <RegisterSetV2
        chosen={chosen}
        previousPerformance={previousPerformance}
        previousLookupError={previousLookupError}
        role={role}
        onRole={setRole}
        quantity={quantity}
        onQuantity={setQuantity}
        load={load}
        onLoad={setLoad}
        unit={unit}
        onUnit={setUnit}
        distanceUnit={distanceUnit}
        onDistanceUnit={setDistanceUnit}
        busy={busy}
        error={error}
        onConfirm={confirmSet}
        onBack={() => setMode('catalogue')}
      />
    );
  }

  if (mode === 'history-detail') {
    return (
      <WorkoutHistoryDetailV2
        selectedHistory={selectedHistory}
        historyDetail={historyDetail}
        detailLoading={detailLoading}
        detailError={detailError}
        nameOf={nameOf}
        onBack={() => setMode('history')}
      />
    );
  }

  if (mode === 'history') {
    return (
      <WorkoutHistoryV2
        history={history}
        overview={overview}
        onOpen={openHistoryDetail}
        onBack={() => setMode('catalogue')}
      />
    );
  }

  if (overview) {
    return (
      <ActiveWorkoutV2
        overview={overview}
        nameOf={nameOf}
        busy={busy}
        error={error}
        onAddExercise={() => setMode('picker')}
        onAddSet={addSetToExercise}
        focusedExerciseId={focusedExerciseId}
        onFocusExercise={setFocusedExerciseId}
        nowMilliseconds={clockMilliseconds}
        restRemainingSeconds={remainingRest}
        restPresetSeconds={restSeconds}
        onRestPreset={selectRestSeconds}
        onRestAdjust={adjustRest}
        onRestDismiss={dismissRest}
        onHistory={() => setMode('history')}
        onFinish={finish}
        onCancel={cancel}
      />
    );
  }

  return (
    <WorkoutHubV2
      onBegin={begin}
      onHistory={() => setMode('history')}
      busy={busy}
      error={error}
      onExplore={() => setMode('explore')}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: '#F5F8FC',
  },
  button: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#075BFF',
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#ffffff', fontWeight: '700' },
  secondaryButton: { backgroundColor: '#EAF2FF' },
  secondaryText: { color: '#075BFF' },
  secondaryButtonDark: { backgroundColor: '#193750' },
  secondaryTextDark: { color: '#ffffff' },
});
