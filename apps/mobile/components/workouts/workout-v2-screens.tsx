/**
 * KeylorForge M3 · UX/UI v2.
 *
 * Presentation-only surfaces driven by actual, owner-scoped workout state.
 * No fake set statistics, pending exercise drafts or simulated timers.
 * All mutations remain with FreeWorkoutSessionExperience.
 */
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ExerciseDetail } from '@/lib/exercises/catalog-api';
import {
  REST_PRESETS_SECONDS,
  type RestPresetSeconds,
} from '@/lib/workouts/rest-timer';
import type {
  ActiveFreeWorkoutOverview,
  ActiveExerciseSummary,
  ActiveSetSummary,
} from '@/lib/workouts/active-workout-overview';
import type {
  FinishedWorkoutDetail,
  FinishedWorkoutHistoryEntry,
} from '@/lib/workouts/local-finish-history';

type Role = 'WORKING' | 'WARMUP';

function Action({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'dark' | 'light' | 'subtle' | 'danger';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.action,
        variant === 'dark' && styles.actionDark,
        variant === 'light' && styles.actionLight,
        variant === 'subtle' && styles.actionSubtle,
        variant === 'danger' && styles.actionDanger,
        disabled && styles.disabled,
      ]}
    >
      <Text
        style={[
          styles.actionText,
          (variant === 'light' || variant === 'subtle') &&
            styles.actionTextLight,
          variant === 'danger' && styles.actionTextDanger,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SectionLabel({
  children,
  dark = false,
}: {
  children: ReactNode;
  dark?: boolean;
}) {
  return (
    <Text style={[styles.sectionLabel, dark && styles.textMutedDark]}>
      {children}
    </Text>
  );
}

function SetValue({ set }: { set: ActiveSetSummary }) {
  const measure =
    set.measurement_type === 'reps'
      ? String(set.reps) + ' rep'
      : set.measurement_type === 'time'
        ? String(set.duration_seconds) + ' s'
        : String(set.distance_decimal) + ' ' + String(set.distance_unit);
  const total =
    set.load_decimal === null
      ? measure
      : measure + ' · ' + set.load_decimal + ' ' + set.load_unit;
  return <Text style={styles.setValue}>{total}</Text>;
}

function SetLedger({ sets }: { sets: ActiveSetSummary[] }) {
  return (
    <View style={styles.ledger}>
      <View style={styles.ledgerHeader}>
        <Text style={styles.ledgerHeaderText}>SERIE</Text>
        <Text style={styles.ledgerHeaderText}>RESULTADO</Text>
        <Text style={styles.ledgerHeaderText}>ESTADO</Text>
      </View>
      {sets.map((set, index) => (
        <View key={set.set_id} style={styles.ledgerRow}>
          <View
            style={[
              styles.setIndex,
              set.set_role === 'WARMUP' && styles.setIndexWarmup,
            ]}
          >
            <Text style={styles.setIndexText}>{index + 1}</Text>
          </View>
          <View style={styles.setMain}>
            <Text style={styles.setKind}>
              {set.set_role === 'WORKING' ? 'Trabajo' : 'Calentamiento'}
            </Text>
            <SetValue set={set} />
          </View>
          <Text style={styles.doneSymbol}>✓</Text>
        </View>
      ))}
    </View>
  );
}

export function WorkoutHubV2({
  onBegin,
  onHistory,
  onExplore,
  busy,
  error,
}: {
  onBegin: () => void;
  onHistory: () => void;
  onExplore: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <View style={styles.lightRoot}>
      <View style={styles.hubIntro}>
        <Text style={styles.brandEyebrow}>KEYLORFORGE / TRAIN</Text>
        <Text accessibilityRole="header" style={styles.hubHeading}>
          Entrenar
        </Text>
        <Text style={styles.hubSubheading}>
          Tu entrenamiento, sin distracciones.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onBegin}
          style={[styles.hubHero, busy && styles.disabled]}
        >
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>EMPIEZA AHORA</Text>
          </View>
          <Text style={styles.heroTitle}>Entrenamiento libre</Text>
          <Text style={styles.heroBody}>
            Elige ejercicios y registra tus series sobre la marcha.
          </Text>
          <Text style={styles.heroAction}>Iniciar entrenamiento libre</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onHistory}
          style={[styles.historyShortcut, busy && styles.disabled]}
        >
          <View style={styles.shortcutIcon}>
            <Text style={styles.shortcutGlyph}>↗</Text>
          </View>
          <View style={styles.shortcutBody}>
            <Text style={styles.shortcutTitle}>Ver historial</Text>
            <Text style={styles.shortcutCaption}>
              Revisa tus sesiones y las series realizadas.
            </Text>
          </View>
          <Text style={styles.shortcutArrow}>›</Text>
        </Pressable>
        {error ? (
          <Text accessibilityLiveRegion="polite" style={styles.errorLight}>
            {error}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={onExplore}
          disabled={busy}
          style={styles.historyShortcut}
        >
          <View style={styles.shortcutIcon}>
            <Text style={styles.shortcutGlyph}>⌕</Text>
          </View>
          <View style={styles.shortcutBody}>
            <Text style={styles.shortcutTitle}>Explorar ejercicios</Text>
            <Text style={styles.shortcutCaption}>
              Abre el catálogo solo cuando lo necesites.
            </Text>
          </View>
          <Text style={styles.shortcutArrow}>›</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function ActiveWorkoutV2({
  overview,
  nameOf,
  busy,
  error,
  onAddExercise,
  onAddSet,
  restRemainingSeconds,
  restPresetSeconds,
  onRestPreset,
  onRestAdjust,
  onRestDismiss,
  onHistory,
  onFinish,
  onCancel,
}: {
  overview: ActiveFreeWorkoutOverview;
  nameOf: (id: string) => string;
  busy: boolean;
  error: string | null;
  onAddExercise: () => void;
  onAddSet: (exercise: ActiveExerciseSummary) => void;
  restRemainingSeconds: number;
  restPresetSeconds: RestPresetSeconds;
  onRestPreset: (seconds: RestPresetSeconds) => void;
  onRestAdjust: (seconds: number) => void;
  onRestDismiss: () => void;
  onHistory: () => void;
  onFinish: () => void;
  onCancel: () => void;
}) {
  return (
    <ScrollView style={styles.darkRoot} contentContainerStyle={styles.darkPage}>
      <Text style={styles.brandEyebrowDark}>KEYLORFORGE / EN CURSO</Text>
      <Text accessibilityRole="header" style={styles.headingDark}>
        Entrenamiento activo
      </Text>
      <Text style={styles.subtitleDark}>
        Controla tus series. Sigue avanzando.
      </Text>
      {restRemainingSeconds > 0 ? (
        <View style={styles.restBox}>
          <View style={styles.restHead}>
            <View>
              <Text style={styles.restEyebrow}>DESCANSO EN CURSO</Text>
              <Text accessibilityRole="timer" style={styles.restCountdown}>
                {String(Math.floor(restRemainingSeconds / 60)).padStart(2, '0')}
                :
                {String(restRemainingSeconds % 60).padStart(2, '0')}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Omitir descanso"
              onPress={onRestDismiss}
              style={styles.restDismiss}
            >
              <Text style={styles.restDismissText}>Omitir</Text>
            </Pressable>
          </View>
          <View style={styles.restActions}>
            <Pressable accessibilityRole="button" onPress={() => onRestAdjust(-15)} style={styles.restAdjust}>
              <Text style={styles.restAdjustText}>−15 s</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => onRestAdjust(15)} style={styles.restAdjust}>
              <Text style={styles.restAdjustText}>+15 s</Text>
            </Pressable>
            {REST_PRESETS_SECONDS.map((seconds) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Descanso ${seconds} segundos`}
                accessibilityState={{ selected: restPresetSeconds === seconds }}
                key={seconds}
                onPress={() => onRestPreset(seconds)}
                style={[styles.restPreset, restPresetSeconds === seconds && styles.restPresetSelected]}
              >
                <Text style={styles.restAdjustText}>{seconds}s</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      <View style={styles.summaryRow}>
        <View style={styles.summaryBlock}>
          <Text style={styles.summaryNumber}>{overview.exercises.length}</Text>
          <Text style={styles.summaryCaption}>EJERCICIOS</Text>
        </View>
        <View style={styles.summaryBlock}>
          <Text style={styles.summaryNumber}>{overview.totalSets}</Text>
          <Text style={styles.summaryCaption}>SERIES</Text>
        </View>
        <View style={styles.summaryBlock}>
          <Text style={styles.summaryNumber}>{overview.workingSets}</Text>
          <Text style={styles.summaryCaption}>TRABAJO</Text>
        </View>
      </View>
      <Text style={styles.countCaption}>
        {overview.totalSets} series confirmadas
      </Text>
      <SectionLabel dark>EJERCICIOS REALIZADOS</SectionLabel>
      {overview.exercises.map((entry, index) => (
        <View key={entry.occurrence_id} style={styles.exerciseCard}>
          <View style={styles.exerciseTop}>
            <View style={styles.exerciseSymbol}>
              <Text style={styles.exerciseSymbolText}>{index + 1}</Text>
            </View>
            <View style={styles.exerciseHeadingWrap}>
              <Text style={styles.exerciseTitle}>
                {nameOf(entry.canonical_exercise_id)}
              </Text>
              <Text style={styles.exerciseMeta}>
                {entry.sets.length} series realizadas
              </Text>
            </View>
          </View>
          <SetLedger sets={entry.sets} />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => onAddSet(entry)}
            accessibilityLabel={'Añadir serie a ' + nameOf(entry.canonical_exercise_id)}
            style={styles.addInline}
          >
            <Text style={styles.addInlineText}>+ Añadir serie</Text>
          </Pressable>
        </View>
      ))}
      {overview.exercises.length === 0 ? (
        <View style={styles.emptyActive}>
          <Text style={styles.emptyActiveTitle}>
            Tu sesión ya está en marcha
          </Text>
          <Text style={styles.emptyActiveText}>
            Elige un ejercicio y confirma tu primera serie.
          </Text>
        </View>
      ) : null}
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.errorDark}>
          {error}
        </Text>
      ) : null}
      <Action
        label="Añadir ejercicio"
        onPress={onAddExercise}
        disabled={busy}
      />
      <View style={styles.spacerSmall} />
      <Action
        label="Finalizar entrenamiento"
        onPress={onFinish}
        disabled={busy || overview.workingSets < 1}
        variant="dark"
      />
      {overview.workingSets === 0 ? (
        <Text style={styles.helperDark}>
          Necesitas confirmar al menos una serie de trabajo para finalizar.
        </Text>
      ) : null}
      <Action
        label="Ver historial"
        onPress={onHistory}
        disabled={busy}
        variant="dark"
      />
      <Action
        label="Cancelar entrenamiento"
        onPress={onCancel}
        disabled={busy}
        variant="danger"
      />
    </ScrollView>
  );
}

function RoleChip({
  title,
  active,
  onPress,
}: {
  title: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.roleChip, active && styles.roleChipSelected]}
    >
      <Text style={[styles.roleText, active && styles.roleTextSelected]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function RegisterSetV2({
  chosen,
  role,
  onRole,
  quantity,
  onQuantity,
  load,
  onLoad,
  unit,
  onUnit,
  distanceUnit,
  onDistanceUnit,
  busy,
  error,
  onConfirm,
  onBack,
}: {
  chosen: Pick<ExerciseDetail, 'id' | 'name' | 'measurement_type'>;
  role: Role;
  onRole: (next: Role) => void;
  quantity: string;
  onQuantity: (next: string) => void;
  load: string;
  onLoad: (next: string) => void;
  unit: 'kg' | 'lb';
  onUnit: (next: 'kg' | 'lb') => void;
  distanceUnit: 'm' | 'km';
  onDistanceUnit: (next: 'm' | 'km') => void;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const measurement = chosen.measurement_type;
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={styles.darkRoot}
      contentContainerStyle={styles.darkPage}
    >
      <Text style={styles.brandEyebrowDark}>REGISTRAR SERIE</Text>
      <Text style={styles.headingDark}>Registrar serie</Text>
      <Text accessibilityRole="header" style={styles.setExerciseTitle}>
        {chosen.name}
      </Text>
      <Text style={styles.subtitleDark}>
        La serie solo se guarda cuando pulses «Confirmar serie».
      </Text>
      <SectionLabel dark>TIPO DE SERIE</SectionLabel>
      <View style={styles.roleRow}>
        <RoleChip
          title="Trabajo"
          active={role === 'WORKING'}
          onPress={() => onRole('WORKING')}
        />
        <RoleChip
          title="Calentamiento"
          active={role === 'WARMUP'}
          onPress={() => onRole('WARMUP')}
        />
      </View>
      <SectionLabel dark>REGISTRA LO QUE HAS HECHO</SectionLabel>
      <View style={styles.fieldsRow}>
        {measurement === 'reps' ? (
          <>
            <View style={styles.metricField}>
              <Text style={styles.metricLabel}>REPETICIONES</Text>
              <TextInput
                accessibilityLabel="Cantidad realizada"
                keyboardType="decimal-pad"
                onChangeText={onQuantity}
                placeholder="0"
                placeholderTextColor="#62788f"
                style={styles.metricInput}
                value={quantity}
              />
              <Text style={styles.metricUnit}>reps</Text>
            </View>
            <View style={styles.metricField}>
              <Text style={styles.metricLabel}>CARGA TOTAL</Text>
              <TextInput
                accessibilityLabel="Carga total opcional"
                keyboardType="decimal-pad"
                onChangeText={onLoad}
                placeholder="—"
                placeholderTextColor="#62788f"
                style={styles.metricInput}
                value={load}
              />
              <Text style={styles.metricUnit}>{unit}</Text>
            </View>
          </>
        ) : (
          <View style={styles.metricField}>
            <Text style={styles.metricLabel}>
              {measurement === 'time' ? 'DURACIÓN' : 'DISTANCIA'}
            </Text>
            <TextInput
              accessibilityLabel="Cantidad realizada"
              keyboardType="decimal-pad"
              onChangeText={onQuantity}
              placeholder="0"
              placeholderTextColor="#62788f"
              style={styles.metricInput}
              value={quantity}
            />
            <Text style={styles.metricUnit}>
              {measurement === 'time' ? 'segundos' : distanceUnit}
            </Text>
          </View>
        )}
      </View>
      {measurement === 'reps' ? (
        <View style={styles.roleRow}>
          <RoleChip
            title="kg"
            active={unit === 'kg'}
            onPress={() => onUnit('kg')}
          />
          <RoleChip
            title="lb"
            active={unit === 'lb'}
            onPress={() => onUnit('lb')}
          />
        </View>
      ) : null}
      {measurement === 'distance' ? (
        <View style={styles.roleRow}>
          <RoleChip
            title="Metros"
            active={distanceUnit === 'm'}
            onPress={() => onDistanceUnit('m')}
          />
          <RoleChip
            title="Kilómetros"
            active={distanceUnit === 'km'}
            onPress={() => onDistanceUnit('km')}
          />
        </View>
      ) : null}
      <View style={styles.disclosure}>
        <Text style={styles.disclosureHeading}>REGISTRO INMEDIATO</Text>
        <Text style={styles.disclosureBody}>
          Tu serie se conserva en el teléfono incluso sin conexión.
        </Text>
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.errorDark}>
          {error}
        </Text>
      ) : null}
      <Action
        label={busy ? 'Guardando…' : 'Confirmar serie'}
        onPress={onConfirm}
        disabled={busy}
      />
      <Action
        label="Volver sin guardar"
        onPress={onBack}
        disabled={busy}
        variant="dark"
      />
    </ScrollView>
  );
}

export function ExercisePickerV2({
  onBack,
  children,
  title = 'Añadir ejercicio',
}: {
  onBack: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <View style={styles.lightRoot}>
      <View style={styles.pickerIntro}>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={styles.pickerBack}
        >
          <Text style={styles.pickerBackText}>‹ Volver al entrenamiento</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.pickerTitle}>
          {title}
        </Text>
        <Text style={styles.pickerSubtitle}>
          Busca en el catálogo y elige qué vas a realizar.
        </Text>
      </View>
      <View style={styles.catalogueSpace}>{children}</View>
    </View>
  );
}

export function WorkoutHistoryV2({
  history,
  overview,
  onOpen,
  onBack,
}: {
  history: FinishedWorkoutHistoryEntry[];
  overview: ActiveFreeWorkoutOverview | null;
  onOpen: (entry: FinishedWorkoutHistoryEntry) => void;
  onBack: () => void;
}) {
  return (
    <ScrollView
      style={styles.lightRoot}
      contentContainerStyle={styles.lightPage}
    >
      <Text style={styles.brandEyebrow}>KEYLORFORGE / REGISTRO</Text>
      <Text accessibilityRole="header" style={styles.lightHeading}>
        Historial
      </Text>
      <Text style={styles.lightSubtitle}>
        Todo lo que has entrenado, organizado por sesiones.
      </Text>
      <SectionLabel>SESIONES FINALIZADAS</SectionLabel>
      {history.map((item) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Ver entrenamiento del ' + item.local_date}
          key={item.session_id}
          onPress={() => onOpen(item)}
          style={styles.historyCard}
        >
          <View style={styles.historyCardTop}>
            <Text style={styles.historyDate}>{item.local_date}</Text>
            <Text style={styles.historyStatus}>✓ FINALIZADO</Text>
          </View>
          <Text style={styles.historyName}>Entrenamiento libre</Text>
          <Text style={styles.historySummary}>
            {item.total_sets} series · {item.working_sets} de trabajo
          </Text>
          <Text style={styles.historyLink}>Ver ejercicios y series ›</Text>
        </Pressable>
      ))}
      {history.length === 0 ? (
        <View style={styles.emptyLight}>
          <Text style={styles.emptyLightTitle}>Aquí empieza tu progreso</Text>
          <Text style={styles.lightSubtitle}>
            Todavía no hay entrenamientos finalizados.
          </Text>
        </View>
      ) : null}
      <Action
        label={overview ? 'Volver al entrenamiento' : 'Volver a Entrenar'}
        onPress={onBack}
        variant="light"
      />
    </ScrollView>
  );
}

export function WorkoutHistoryDetailV2({
  selectedHistory,
  historyDetail,
  detailLoading,
  detailError,
  nameOf,
  onBack,
}: {
  selectedHistory: FinishedWorkoutHistoryEntry | null;
  historyDetail: FinishedWorkoutDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  nameOf: (id: string) => string;
  onBack: () => void;
}) {
  return (
    <ScrollView
      style={styles.lightRoot}
      contentContainerStyle={styles.lightPage}
    >
      <Action label="Volver al historial" onPress={onBack} variant="subtle" />
      <Text style={styles.brandEyebrow}>ENTRENAMIENTO FINALIZADO</Text>
      <Text accessibilityRole="header" style={styles.lightHeading}>
        {selectedHistory?.local_date ?? 'Detalle del entrenamiento'}
      </Text>
      {detailLoading ? (
        <ActivityIndicator accessibilityLabel="Cargando detalle del entrenamiento" />
      ) : detailError ? (
        <Text accessibilityLiveRegion="polite" style={styles.errorLight}>
          {detailError}
        </Text>
      ) : historyDetail ? (
        <>
          <View style={styles.detailSummary}>
            <Text style={styles.detailStat}>
              {historyDetail.entry.total_sets}
            </Text>
            <Text style={styles.detailStatLabel}>SERIES CONFIRMADAS</Text>
            <Text style={styles.detailStat}>
              {historyDetail.entry.working_sets}
            </Text>
            <Text style={styles.detailStatLabel}>DE TRABAJO</Text>
          </View>
          {historyDetail.exercises.map((exercise) => (
            <View key={exercise.occurrence_id} style={styles.detailCard}>
              <Text style={styles.detailExercise}>
                {nameOf(exercise.canonical_exercise_id)}
              </Text>
              {exercise.sets.map((set, index) => {
                const performed =
                  set.measurement_type === 'reps'
                    ? String(set.reps) + ' rep'
                    : set.measurement_type === 'time'
                      ? String(set.duration_seconds) + ' s'
                      : String(set.distance_decimal) + ' ' + set.distance_unit;
                const load =
                  set.load_decimal === null
                    ? ''
                    : ' · ' + set.load_decimal + ' ' + set.load_unit;
                return (
                  <View key={set.set_id} style={styles.detailSetRow}>
                    <Text style={styles.detailSetKind}>
                      {index + 1}.{' '}
                      {set.set_role === 'WORKING' ? 'Trabajo' : 'Calentamiento'}
                    </Text>
                    <Text style={styles.detailSetResult}>
                      {performed + load}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  restBox: {
    backgroundColor: '#102C45',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#00D1C1',
    padding: 16,
    gap: 12,
  },
  restHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  restEyebrow: { color: '#00D1C1', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  restCountdown: { color: '#FFFFFF', fontSize: 36, fontWeight: '900', fontVariant: ['tabular-nums'] },
  restDismiss: { padding: 10 },
  restDismissText: { color: '#AFC7D9', fontSize: 13, fontWeight: '800' },
  restActions: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  restAdjust: { backgroundColor: '#193750', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9 },
  restPreset: { borderRadius: 9, borderWidth: 1, borderColor: '#38526C', paddingHorizontal: 9, paddingVertical: 8 },
  restPresetSelected: { borderColor: '#00D1C1', backgroundColor: '#145B60' },
  restAdjustText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  lightRoot: { flex: 1, backgroundColor: '#F5F8FC' },
  lightPage: { padding: 20, paddingBottom: 50, gap: 14 },
  hubIntro: { paddingHorizontal: 20, paddingTop: 20, gap: 10 },
  brandEyebrow: {
    color: '#075BFF',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1.8,
  },
  hubHeading: { fontSize: 34, fontWeight: '900', color: '#081527' },
  hubSubheading: { fontSize: 14, color: '#677383', marginBottom: 8 },
  hubHero: {
    borderRadius: 21,
    backgroundColor: '#061524',
    padding: 20,
    gap: 14,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#00BDAF',
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  heroBadgeText: { color: '#061524', fontSize: 10, fontWeight: '900' },
  heroTitle: { fontSize: 23, fontWeight: '900', color: '#FFFFFF' },
  heroBody: { color: '#9FB1C4', fontSize: 13, lineHeight: 20 },
  heroAction: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  historyShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    gap: 12,
  },
  shortcutIcon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: '#EAF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutGlyph: { color: '#075BFF', fontSize: 22, fontWeight: '800' },
  shortcutBody: { flex: 1, gap: 4 },
  shortcutTitle: { fontSize: 16, fontWeight: '800', color: '#081527' },
  shortcutCaption: { fontSize: 12, color: '#677383', lineHeight: 17 },
  shortcutArrow: { fontSize: 28, color: '#075BFF' },
  catalogueSpace: { flex: 1, minHeight: 120 },
  pickerIntro: { padding: 20, paddingBottom: 8, gap: 9 },
  pickerBack: { minHeight: 45, justifyContent: 'center' },
  pickerBackText: { color: '#075BFF', fontSize: 15, fontWeight: '800' },
  pickerTitle: { fontSize: 28, color: '#081527', fontWeight: '900' },
  pickerSubtitle: { color: '#677383', fontSize: 13, marginBottom: 4 },
  sectionLabel: {
    color: '#677383',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.35,
    marginTop: 10,
  },
  darkRoot: { flex: 1, backgroundColor: '#061524' },
  darkPage: { padding: 20, paddingBottom: 55, gap: 13, minHeight: '100%' },
  brandEyebrowDark: {
    color: '#00BDAF',
    fontWeight: '900',
    letterSpacing: 1.6,
    fontSize: 11,
  },
  headingDark: { fontSize: 29, fontWeight: '900', color: '#ffffff' },
  subtitleDark: { fontSize: 13, color: '#9FB1C4', marginBottom: 8 },
  textMutedDark: { color: '#9FB1C4' },
  summaryRow: { flexDirection: 'row', gap: 9, marginBottom: 3 },
  summaryBlock: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: '#0D2137',
    paddingVertical: 15,
    alignItems: 'center',
    gap: 5,
  },
  summaryNumber: { color: '#FFFFFF', fontSize: 30, fontWeight: '900' },
  summaryCaption: { color: '#9FB1C4', fontSize: 10, fontWeight: '800' },
  countCaption: { color: '#00BDAF', fontSize: 13, fontWeight: '700' },
  exerciseCard: {
    borderRadius: 18,
    backgroundColor: '#0D2137',
    padding: 15,
    gap: 14,
    borderColor: '#193750',
    borderWidth: 1,
  },
  exerciseTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  exerciseSymbol: {
    height: 45,
    width: 45,
    borderRadius: 13,
    backgroundColor: '#193750',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseSymbolText: { color: '#00BDAF', fontSize: 21, fontWeight: '900' },
  exerciseHeadingWrap: { flex: 1, gap: 3 },
  exerciseTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  exerciseMeta: { color: '#9FB1C4', fontSize: 12 },
  ledger: { gap: 7 },
  ledgerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
  },
  ledgerHeaderText: {
    color: '#9FB1C4',
    fontSize: 10,
    fontWeight: '800',
  },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#193750',
    borderRadius: 10,
    minHeight: 57,
    paddingHorizontal: 10,
    gap: 12,
  },
  setIndex: {
    width: 33,
    height: 33,
    borderRadius: 10,
    backgroundColor: '#075BFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  setIndexWarmup: { backgroundColor: '#52647C' },
  setIndexText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  setMain: { flex: 1, gap: 3 },
  setKind: { color: '#AFC2D6', fontSize: 11, fontWeight: '700' },
  setValue: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  doneSymbol: { color: '#00BDAF', fontSize: 20, fontWeight: '900' },
  addInline: { minHeight: 45, justifyContent: 'center' },
  addInlineText: { color: '#00BDAF', fontSize: 14, fontWeight: '800' },
  emptyActive: {
    padding: 22,
    borderRadius: 17,
    backgroundColor: '#0D2137',
    gap: 10,
  },
  emptyActiveTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '900' },
  emptyActiveText: { color: '#9FB1C4', fontSize: 13, lineHeight: 19 },
  action: {
    minHeight: 52,
    backgroundColor: '#075BFF',
    borderRadius: 13,
    paddingHorizontal: 16,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  actionDark: { backgroundColor: '#193750' },
  actionLight: { backgroundColor: '#EAF2FF' },
  actionSubtle: { backgroundColor: '#E3EAF2' },
  actionDanger: { backgroundColor: '#311D31' },
  actionText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  actionTextLight: { color: '#075BFF' },
  actionTextDanger: { color: '#FFC2C2' },
  disabled: { opacity: 0.45 },
  spacerSmall: { height: 3 },
  helperDark: { color: '#9FB1C4', fontSize: 12, lineHeight: 17 },
  setExerciseTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  roleChip: {
    borderRadius: 10,
    backgroundColor: '#193750',
    minHeight: 46,
    paddingHorizontal: 17,
    justifyContent: 'center',
  },
  roleChipSelected: { backgroundColor: '#075BFF' },
  roleText: { color: '#C4D3E2', fontSize: 14, fontWeight: '800' },
  roleTextSelected: { color: '#FFFFFF' },
  fieldsRow: { flexDirection: 'row', gap: 10 },
  metricField: {
    flex: 1,
    minWidth: 0,
    padding: 14,
    backgroundColor: '#0D2137',
    borderRadius: 16,
    gap: 5,
  },
  metricLabel: { color: '#9FB1C4', fontSize: 10, fontWeight: '800' },
  metricInput: {
    fontSize: 35,
    color: '#FFFFFF',
    fontWeight: '900',
    padding: 0,
    minHeight: 57,
  },
  metricUnit: { color: '#9FB1C4', fontWeight: '700', fontSize: 12 },
  disclosure: {
    borderRadius: 13,
    backgroundColor: '#0D2137',
    padding: 16,
    gap: 7,
    marginVertical: 11,
  },
  disclosureHeading: { color: '#00BDAF', fontSize: 11, fontWeight: '800' },
  disclosureBody: { color: '#9FB1C4', fontSize: 12, lineHeight: 18 },
  errorDark: { color: '#FFB4A8', fontSize: 13 },
  errorLight: { color: '#B42318', fontSize: 13, lineHeight: 19 },
  lightHeading: { fontSize: 30, color: '#081527', fontWeight: '900' },
  lightSubtitle: { color: '#677383', fontSize: 13, lineHeight: 20 },
  historyCard: {
    padding: 17,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    gap: 11,
  },
  historyCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyDate: { color: '#677383', fontSize: 12, fontWeight: '800' },
  historyStatus: { color: '#008F82', fontSize: 10, fontWeight: '900' },
  historyName: { color: '#081527', fontSize: 18, fontWeight: '900' },
  historySummary: { color: '#677383', fontSize: 13, fontWeight: '600' },
  historyLink: {
    alignSelf: 'flex-end',
    color: '#075BFF',
    fontSize: 12,
    fontWeight: '800',
  },
  emptyLight: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    padding: 18,
    gap: 10,
  },
  emptyLightTitle: { color: '#081527', fontSize: 18, fontWeight: '800' },
  detailSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    padding: 19,
    flexWrap: 'wrap',
    gap: 13,
  },
  detailStat: { color: '#075BFF', fontSize: 29, fontWeight: '900' },
  detailStatLabel: { color: '#677383', fontSize: 10, fontWeight: '800' },
  detailCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 17,
    gap: 13,
  },
  detailExercise: { color: '#081527', fontSize: 17, fontWeight: '900' },
  detailSetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4EAF2',
    gap: 8,
  },
  detailSetKind: { color: '#677383', fontSize: 12, fontWeight: '700' },
  detailSetResult: { color: '#081527', fontSize: 13, fontWeight: '800' },
});
