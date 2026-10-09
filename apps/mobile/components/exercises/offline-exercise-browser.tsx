/**
 * M3-MOB-009 — user-facing canonical exercise search using only a completed
 * public SQLite snapshot. No workout session, set, or outbox writes occur here.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/lib/auth/auth-provider';
import type { ExerciseListItem } from '@/lib/exercises/catalog-api';
import {
  offlineCatalogueStatus,
  searchOfflineExercises,
  seedOfflineCatalogueFromApi,
  type CachedCatalogueStatus,
} from '@/lib/exercises/offline-catalogue';
import { openOfflineExerciseCatalogue } from '@/lib/exercises/offline-catalogue-adapter';
import type { StartSyncAccess } from '@/lib/workouts/start-session-sync';

type Reference = { id: string; name: string };
type Snapshot = {
  status: CachedCatalogueStatus;
  items: ExerciseListItem[];
};

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');
}

function uniqueReferences(
  items: readonly ExerciseListItem[],
  key: 'primary_muscles' | 'equipment',
): Reference[] {
  const found = new Map<string, string>();
  for (const item of items) {
    for (const reference of item[key]) {
      if (!found.has(reference.id)) found.set(reference.id, reference.name);
    }
  }
  return [...found]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

async function loadCompleteSnapshot(): Promise<Snapshot> {
  const db = await openOfflineExerciseCatalogue();
  const status = await offlineCatalogueStatus(db);
  if (status.state === 'unseeded') return { status, items: [] };
  const items: ExerciseListItem[] = [];
  for (let offset = 0; offset < status.total; offset += 100) {
    const page = await searchOfflineExercises(db, { offset, limit: 100 });
    if (
      page.total !== status.total ||
      page.items.length !== Math.min(100, status.total - offset)
    ) {
      throw new Error(
        'El catálogo local cambió durante la lectura. Vuelve a intentarlo.',
      );
    }
    items.push(...page.items);
  }
  return { status, items };
}

function FilterChips({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Reference[];
  selected: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <View style={styles.filterGroup}>
      <Text style={styles.filterTitle}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        <Pressable
          accessibilityLabel={`Todos los filtros de ${label.toLowerCase()}`}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === null }}
          onPress={() => onChange(null)}
          style={[styles.chip, selected === null && styles.chipActive]}
        >
          <Text
            style={[
              styles.chipText,
              selected === null && styles.chipTextActive,
            ]}
          >
            Todos
          </Text>
        </Pressable>
        {options.map((option) => (
          <Pressable
            accessibilityLabel={`Filtrar ${label.toLowerCase()} por ${option.name}`}
            accessibilityRole="button"
            accessibilityState={{ selected: selected === option.id }}
            key={option.id}
            onPress={() => onChange(selected === option.id ? null : option.id)}
            style={[styles.chip, selected === option.id && styles.chipActive]}
          >
            <Text
              style={[
                styles.chipText,
                selected === option.id && styles.chipTextActive,
              ]}
            >
              {option.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function measurement(value: string): string {
  if (value === 'reps') return 'Repeticiones';
  if (value === 'time') return 'Tiempo';
  return 'Distancia';
}

export function OfflineExerciseBrowser() {
  const { session } = useAuth();
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  const mounted = useRef(false);
  const [status, setStatus] = useState<CachedCatalogueStatus>({
    state: 'unseeded',
  });
  const [items, setItems] = useState<ExerciseListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Platform.OS !== 'web');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [muscleId, setMuscleId] = useState<string | null>(null);
  const [equipmentId, setEquipmentId] = useState<string | null>(null);

  const refreshLocal = useCallback(async () => {
    const snapshot = await loadCompleteSnapshot();
    if (mounted.current) {
      setStatus(snapshot.status);
      setItems(snapshot.items);
      setReadError(null);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (Platform.OS === 'web') {
      return () => {
        mounted.current = false;
      };
    }
    void refreshLocal()
      .catch((error: unknown) => {
        if (mounted.current)
          setReadError(
            error instanceof Error ? error.message : 'Error al leer SQLite.',
          );
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
    return () => {
      mounted.current = false;
    };
  }, [refreshLocal]);

  const download = async () => {
    if (busy || Platform.OS === 'web') return;
    setBusy(true);
    setFeedback(null);
    const access: StartSyncAccess = {
      currentAuthenticatedSubject: () => sessionRef.current?.user.id ?? null,
      acquireCurrentCredentials: async () => {
        const active = sessionRef.current;
        return active?.access_token && active.user.id
          ? { subject: active.user.id, accessToken: active.access_token }
          : null;
      },
    };
    try {
      const db = await openOfflineExerciseCatalogue();
      await seedOfflineCatalogueFromApi(db, access);
      await refreshLocal();
      if (mounted.current)
        setFeedback('Catálogo guardado. Puedes consultarlo sin Internet.');
    } catch {
      if (mounted.current) {
        // Never hide an existing cached catalogue after a failed refresh.
        setFeedback(
          'No se pudo actualizar el catálogo. Si ya estaba descargado, sigue disponible sin conexión.',
        );
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const muscles = useMemo(
    () => uniqueReferences(items, 'primary_muscles'),
    [items],
  );
  const equipment = useMemo(
    () => uniqueReferences(items, 'equipment'),
    [items],
  );
  const filtered = useMemo(() => {
    const query = fold(search.trim());
    return items.filter(
      (item) =>
        (!query || fold(item.name).includes(query)) &&
        (!muscleId || item.primary_muscles.some((v) => v.id === muscleId)) &&
        (!equipmentId || item.equipment.some((v) => v.id === equipmentId)),
    );
  }, [items, search, muscleId, equipmentId]);

  const header = (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>KEYLORFORGE · ENTRENAR</Text>
      <Text accessibilityRole="header" style={styles.title}>
        Ejercicios sin conexión
      </Text>
      <Text style={styles.subtitle}>
        Consulta ejercicios guardados en tu dispositivo. Esta pantalla no inicia
        ni registra entrenamientos.
      </Text>
      <View style={styles.statusCard}>
        <Text testID="offline-catalogue-status" style={styles.statusText}>
          {status.state === 'ready'
            ? `CATÁLOGO DISPONIBLE · ${status.total} ejercicios`
            : 'CATÁLOGO NO DESCARGADO'}
        </Text>
        <Text style={styles.statusHint}>
          {status.state === 'ready'
            ? 'Búsqueda y filtros locales, sin conexión a la API.'
            : 'Conéctate una vez para guardar el catálogo.'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Descargar o actualizar catálogo offline"
          disabled={busy || loading}
          onPress={() => void download()}
          style={[styles.downloadButton, (busy || loading) && styles.disabled]}
        >
          <Text style={styles.downloadText}>
            {busy ? 'Descargando catálogo…' : 'Descargar / actualizar catálogo'}
          </Text>
        </Pressable>
        {feedback ? (
          <Text accessibilityLiveRegion="polite" style={styles.feedback}>
            {feedback}
          </Text>
        ) : null}
      </View>

      {status.state === 'ready' ? (
        <>
          <TextInput
            accessibilityLabel="Buscar ejercicios guardados"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setSearch}
            placeholder="Buscar por nombre sin Internet"
            style={styles.searchInput}
            value={search}
          />
          <FilterChips
            label="Músculo"
            options={muscles}
            selected={muscleId}
            onChange={setMuscleId}
          />
          <FilterChips
            label="Equipamiento"
            options={equipment}
            selected={equipmentId}
            onChange={setEquipmentId}
          />
          <Text testID="offline-catalogue-results" style={styles.resultCount}>
            {filtered.length} de {status.total} ejercicios
          </Text>
        </>
      ) : null}
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webFallback}>
        <Text accessibilityRole="header" style={styles.title}>
          Catálogo sin conexión
        </Text>
        <Text>
          La caché SQLite de ejercicios solo está disponible en Android y iOS.
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator accessibilityLabel="Leyendo ejercicios de SQLite" />
          <Text>Cargando catálogo local…</Text>
        </View>
      ) : readError ? (
        <View style={styles.center}>
          <Text accessibilityRole="header" style={styles.title}>
            No se pudo leer el catálogo
          </Text>
          <Text accessibilityLiveRegion="polite">{readError}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setReadError(null);
              setLoading(true);
              void refreshLocal()
                .catch((error: unknown) => {
                  if (mounted.current)
                    setReadError(
                      error instanceof Error
                        ? error.message
                        : 'Error al leer SQLite.',
                    );
                })
                .finally(() => {
                  if (mounted.current) setLoading(false);
                });
            }}
            style={styles.downloadButton}
          >
            <Text style={styles.downloadText}>Reintentar lectura local</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.content}
          data={filtered}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={header}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {status.state === 'unseeded'
                ? 'Todavía no hay ejercicios guardados en este dispositivo.'
                : 'Ningún ejercicio coincide con la búsqueda y los filtros.'}
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.item} testID={`offline-exercise-${item.id}`}>
              <Text style={styles.exerciseName}>{item.name}</Text>
              <Text style={styles.meta}>
                {measurement(item.measurement_type)} ·{' '}
                {item.equipment.map((ref) => ref.name).join(', ') ||
                  'Sin equipamiento especificado'}
              </Text>
              <Text style={styles.muscles}>
                {item.primary_muscles.map((ref) => ref.name).join(', ') ||
                  'Sin músculo principal especificado'}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#f6f8fc', flex: 1 },
  content: { padding: 20, paddingBottom: 30 },
  center: {
    alignItems: 'center',
    flex: 1,
    gap: 14,
    justifyContent: 'center',
    padding: 22,
  },
  webFallback: { flex: 1, gap: 14, padding: 24 },
  header: { gap: 12, paddingBottom: 14 },
  eyebrow: {
    color: '#075bff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  title: { color: '#12213a', fontSize: 25, fontWeight: '800' },
  subtitle: { color: '#536880', fontSize: 14, lineHeight: 21 },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 15,
    gap: 10,
    padding: 18,
  },
  statusText: { color: '#12213a', fontSize: 16, fontWeight: '800' },
  statusHint: { color: '#536880', fontSize: 13, lineHeight: 20 },
  downloadButton: {
    alignItems: 'center',
    backgroundColor: '#075bff',
    borderRadius: 12,
    padding: 14,
  },
  downloadText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  feedback: { color: '#31435f', fontSize: 13, lineHeight: 19 },
  searchInput: {
    backgroundColor: '#fff',
    borderColor: '#dae3ef',
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 15,
    padding: 14,
  },
  filterGroup: { gap: 8 },
  filterTitle: { color: '#344761', fontSize: 13, fontWeight: '700' },
  filterRow: { gap: 7, paddingBottom: 3 },
  chip: {
    backgroundColor: '#e6ecf6',
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: '#075bff' },
  chipText: { color: '#344761', fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  resultCount: {
    color: '#536880',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  item: {
    backgroundColor: '#fff',
    borderBottomColor: '#e4eaf2',
    borderBottomWidth: 1,
    padding: 17,
  },
  exerciseName: { color: '#12213a', fontSize: 16, fontWeight: '700' },
  meta: { color: '#526074', fontSize: 12, marginTop: 6 },
  muscles: { color: '#65768e', fontSize: 12, marginTop: 4 },
  empty: { color: '#526074', fontSize: 14, padding: 20, textAlign: 'center' },
});
