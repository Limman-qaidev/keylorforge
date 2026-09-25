import {
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/lib/auth/auth-provider';
import {
  CatalogApiError,
  type CatalogueReference,
  type ExerciseDetail,
  type ExerciseListItem,
  getExercise,
  listEquipment,
  listExercises,
  listMuscles,
} from '@/lib/exercises/catalog-api';

type AuthenticatedRequestContext = {
  accessToken: string;
  invalidateSession: () => Promise<void>;
  refreshSession: () => Promise<string | null>;
};

async function runWithAuthRetry<T>(
  operation: (accessToken: string) => Promise<T>,
  context: AuthenticatedRequestContext,
): Promise<T> {
  try {
    return await operation(context.accessToken);
  } catch (error) {
    if (!(error instanceof CatalogApiError) || error.kind !== 'auth') {
      throw error;
    }

    let refreshedAccessToken: string | null;
    try {
      refreshedAccessToken = await context.refreshSession();
    } catch {
      throw new CatalogApiError(
        'network',
        'No se pudo renovar la sesión. Comprueba tu conexión e inténtalo de nuevo.',
      );
    }

    if (!refreshedAccessToken) {
      throw error;
    }

    try {
      return await operation(refreshedAccessToken);
    } catch (retryError) {
      if (
        retryError instanceof CatalogApiError &&
        retryError.kind === 'auth'
      ) {
        await context.invalidateSession();
      }
      throw retryError;
    }
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof CatalogApiError) {
    return error.message;
  }
  return 'No se pudo cargar el catálogo. Inténtalo de nuevo.';
}

function measurementLabel(value: string): string {
  const labels: Record<string, string> = {
    distance: 'Distancia',
    reps: 'Repeticiones',
    time: 'Tiempo',
  };
  return labels[value] ?? value;
}

function roleLabel(value: string): string {
  const labels: Record<string, string> = {
    primary: 'Principal',
    secondary: 'Secundario',
    tertiary: 'Terciario',
  };
  return labels[value] ?? value;
}

function displayMetadata(value: string | null): string {
  if (!value) {
    return 'No especificado';
  }
  return value.replace(/_/g, ' ');
}

function referenceNames(values: CatalogueReference[]): string {
  if (values.length === 0) {
    return 'Sin especificar';
  }
  return values.map((value) => value.name).join(' · ');
}

type FilterRowProps = {
  label: string;
  options: CatalogueReference[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

function FilterRow({
  label,
  onSelect,
  options,
  selectedId,
}: FilterRowProps) {
  return (
    <View style={styles.filterGroup}>
      <Text style={styles.filterLabel}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroller}
      >
        <Pressable
          accessibilityLabel={'Quitar filtro de ' + label.toLowerCase()}
          accessibilityRole="button"
          onPress={() => onSelect(null)}
          style={[
            styles.filterChip,
            selectedId === null && styles.filterChipSelected,
          ]}
        >
          <Text
            style={[
              styles.filterChipText,
              selectedId === null && styles.filterChipTextSelected,
            ]}
          >
            Todos
          </Text>
        </Pressable>
        {options.map((option) => {
          const selected = option.id === selectedId;
          return (
            <Pressable
              accessibilityLabel={'Filtrar por ' + label.toLowerCase() + ' ' + option.name}
              accessibilityRole="button"
              key={option.id}
              onPress={() => onSelect(option.id)}
              style={[styles.filterChip, selected && styles.filterChipSelected]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selected && styles.filterChipTextSelected,
                ]}
              >
                {option.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

type ExerciseCardProps = {
  exercise: ExerciseListItem;
  onOpen: (exerciseId: string) => void;
};

function ExerciseCard({ exercise, onOpen }: ExerciseCardProps) {
  return (
    <Pressable
      accessibilityLabel={'Abrir ' + exercise.name}
      accessibilityRole="button"
      onPress={() => onOpen(exercise.id)}
      style={({ pressed }) => [
        styles.exerciseRow,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.exerciseMain}>
        <Text style={styles.exerciseName}>{exercise.name}</Text>
        <Text style={styles.exerciseMeta}>
          {measurementLabel(exercise.measurement_type)}
          {' · '}
          {displayMetadata(exercise.category)}
        </Text>
        <Text style={styles.exerciseSecondary}>
          {referenceNames(exercise.primary_muscles)}
        </Text>
        <Text style={styles.exerciseSecondary}>
          {referenceNames(exercise.equipment)}
        </Text>
      </View>
      <Text accessible={false} style={styles.chevron}>
        ›
      </Text>
    </Pressable>
  );
}

type DetailViewProps = {
  detail: ExerciseDetail;
  onBack: () => void;
};

function DetailView({ detail, onBack }: DetailViewProps) {
  return (
    <ScrollView
      contentContainerStyle={styles.detailContent}
      style={styles.container}
    >
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={styles.backButton}
      >
        <Text style={styles.backButtonText}>‹ Volver al catálogo</Text>
      </Pressable>

      <Text style={styles.eyebrow}>DETALLE DEL EJERCICIO</Text>
      <Text accessibilityRole="header" style={styles.title}>
        {detail.name}
      </Text>

      <View style={styles.metadataGrid}>
        <View style={styles.metadataBlock}>
          <Text style={styles.metadataLabel}>Medición</Text>
          <Text style={styles.metadataValue}>
            {measurementLabel(detail.measurement_type)}
          </Text>
        </View>
        <View style={styles.metadataBlock}>
          <Text style={styles.metadataLabel}>Dificultad</Text>
          <Text style={styles.metadataValue}>
            {displayMetadata(detail.difficulty_level)}
          </Text>
        </View>
        <View style={styles.metadataBlock}>
          <Text style={styles.metadataLabel}>Categoría</Text>
          <Text style={styles.metadataValue}>
            {displayMetadata(detail.category)}
          </Text>
        </View>
        <View style={styles.metadataBlock}>
          <Text style={styles.metadataLabel}>Mecánica</Text>
          <Text style={styles.metadataValue}>
            {displayMetadata(detail.mechanics)}
          </Text>
        </View>
        <View style={styles.metadataBlock}>
          <Text style={styles.metadataLabel}>Fuerza</Text>
          <Text style={styles.metadataValue}>
            {displayMetadata(detail.force_type)}
          </Text>
        </View>
      </View>

      <View style={styles.detailSection}>
        <Text style={styles.sectionTitle}>Músculos</Text>
        {detail.muscles.length === 0 ? (
          <Text style={styles.emptyInline}>Sin músculos asociados.</Text>
        ) : (
          detail.muscles.map((muscle) => (
            <View key={muscle.id} style={styles.relationshipRow}>
              <Text style={styles.relationshipName}>{muscle.name}</Text>
              <Text style={styles.relationshipRole}>
                {roleLabel(muscle.role)}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.detailSection}>
        <Text style={styles.sectionTitle}>Equipamiento</Text>
        <Text style={styles.detailBody}>
          {referenceNames(detail.equipment)}
        </Text>
      </View>
    </ScrollView>
  );
}

export function ExerciseCatalogScreen() {
  const { invalidateSession, refreshSession, session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [primaryMuscleId, setPrimaryMuscleId] = useState<string | null>(null);
  const [equipmentId, setEquipmentId] = useState<string | null>(null);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(
    null,
  );

  const requestContext = useMemo<AuthenticatedRequestContext | null>(() => {
    if (!accessToken) {
      return null;
    }
    return { accessToken, invalidateSession, refreshSession };
  }, [accessToken, invalidateSession, refreshSession]);

  const musclesQuery = useQuery({
    enabled: requestContext !== null,
    queryKey: ['exercise-catalog-muscles', 'es'],
    queryFn: () => {
      if (!requestContext) {
        throw new CatalogApiError('auth', 'Tu sesión ha terminado.');
      }
      return runWithAuthRetry(listMuscles, requestContext);
    },
    retry: false,
  });

  const equipmentQuery = useQuery({
    enabled: requestContext !== null,
    queryKey: ['exercise-catalog-equipment', 'es'],
    queryFn: () => {
      if (!requestContext) {
        throw new CatalogApiError('auth', 'Tu sesión ha terminado.');
      }
      return runWithAuthRetry(listEquipment, requestContext);
    },
    retry: false,
  });

  const exercisesQuery = useInfiniteQuery({
    enabled: requestContext !== null,
    initialPageParam: 1,
    queryKey: [
      'exercise-catalog',
      'es',
      search,
      primaryMuscleId,
      equipmentId,
    ],
    queryFn: ({ pageParam }) => {
      if (!requestContext) {
        throw new CatalogApiError('auth', 'Tu sesión ha terminado.');
      }
      return runWithAuthRetry(
        (token) =>
          listExercises(token, {
            equipmentId: equipmentId ?? undefined,
            page: pageParam,
            pageSize: 30,
            primaryMuscleId: primaryMuscleId ?? undefined,
            search: search || undefined,
          }),
        requestContext,
      );
    },
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.total_pages
        ? lastPage.page + 1
        : undefined,
    retry: false,
  });

  const detailQuery = useQuery({
    enabled: requestContext !== null && selectedExerciseId !== null,
    queryKey: ['exercise-catalog-detail', selectedExerciseId, 'es'],
    queryFn: () => {
      if (!requestContext || !selectedExerciseId) {
        throw new CatalogApiError('auth', 'Tu sesión ha terminado.');
      }
      return runWithAuthRetry(
        (token) => getExercise(token, selectedExerciseId),
        requestContext,
      );
    },
    retry: false,
  });

  if (!requestContext) {
    return (
      <View style={styles.centered}>
        <Text accessibilityLiveRegion="polite" style={styles.errorText}>
          Tu sesión ha terminado. Vuelve a iniciar sesión.
        </Text>
      </View>
    );
  }

  if (selectedExerciseId) {
    if (detailQuery.isPending) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator accessibilityLabel="Cargando ejercicio" />
          <Text style={styles.loadingText}>Cargando ejercicio…</Text>
        </View>
      );
    }

    if (detailQuery.isError || !detailQuery.data) {
      return (
        <View style={styles.centered}>
          <Text accessibilityRole="header" style={styles.errorTitle}>
            No se pudo abrir el ejercicio
          </Text>
          <Text accessibilityLiveRegion="polite" style={styles.errorText}>
            {errorMessage(detailQuery.error)}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void detailQuery.refetch()}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Reintentar</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSelectedExerciseId(null)}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Volver al catálogo</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <DetailView
        detail={detailQuery.data}
        onBack={() => setSelectedExerciseId(null)}
      />
    );
  }

  const filtersPending = musclesQuery.isPending || equipmentQuery.isPending;
  const initialPending = exercisesQuery.isPending || filtersPending;
  const baseError =
    exercisesQuery.error ?? musclesQuery.error ?? equipmentQuery.error;
  const items = exercisesQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const total = exercisesQuery.data?.pages[0]?.total ?? 0;
  const hasActiveFilters =
    Boolean(search) || primaryMuscleId !== null || equipmentId !== null;

  const resetFilters = () => {
    setSearchDraft('');
    setSearch('');
    setPrimaryMuscleId(null);
    setEquipmentId(null);
  };

  const retryAll = () => {
    void Promise.all([
      exercisesQuery.refetch(),
      musclesQuery.refetch(),
      equipmentQuery.refetch(),
    ]);
  };

  const header = (
    <View>
      <Text style={styles.eyebrow}>KEYLORFORGE · ENTRENAR</Text>
      <Text accessibilityRole="header" style={styles.title}>
        Catálogo de ejercicios
      </Text>
      <Text style={styles.subtitle}>
        Busca y filtra el catálogo canónico de KeylorForge.
      </Text>

      <View style={styles.searchRow}>
        <TextInput
          accessibilityLabel="Buscar ejercicios"
          autoCapitalize="none"
          onChangeText={setSearchDraft}
          onSubmitEditing={() => setSearch(searchDraft.trim())}
          placeholder="Buscar por nombre"
          returnKeyType="search"
          style={styles.searchInput}
          value={searchDraft}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => setSearch(searchDraft.trim())}
          style={styles.searchButton}
        >
          <Text style={styles.searchButtonText}>Buscar</Text>
        </Pressable>
      </View>

      <FilterRow
        label="Músculo"
        onSelect={setPrimaryMuscleId}
        options={musclesQuery.data ?? []}
        selectedId={primaryMuscleId}
      />
      <FilterRow
        label="Equipamiento"
        onSelect={setEquipmentId}
        options={equipmentQuery.data ?? []}
        selectedId={equipmentId}
      />

      <View style={styles.resultsHeader}>
        <Text style={styles.resultsText}>
          {total === 1 ? '1 ejercicio' : String(total) + ' ejercicios'}
        </Text>
        {hasActiveFilters ? (
          <Pressable
            accessibilityRole="button"
            onPress={resetFilters}
            style={styles.clearButton}
          >
            <Text style={styles.clearButtonText}>Limpiar filtros</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  if (initialPending) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator accessibilityLabel="Cargando catálogo" />
        <Text style={styles.loadingText}>Cargando catálogo…</Text>
      </View>
    );
  }

  if (baseError && items.length === 0) {
    return (
      <View style={styles.centered}>
        <Text accessibilityRole="header" style={styles.errorTitle}>
          No se pudo cargar el catálogo
        </Text>
        <Text accessibilityLiveRegion="polite" style={styles.errorText}>
          {errorMessage(baseError)}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={retryAll}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={items}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No hay ejercicios</Text>
          <Text style={styles.emptyText}>
            Prueba otra búsqueda o cambia los filtros seleccionados.
          </Text>
          {hasActiveFilters ? (
            <Pressable
              accessibilityRole="button"
              onPress={resetFilters}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Limpiar filtros</Text>
            </Pressable>
          ) : null}
        </View>
      }
      ListFooterComponent={
        exercisesQuery.hasNextPage ? (
          <Pressable
            accessibilityRole="button"
            disabled={exercisesQuery.isFetchingNextPage}
            onPress={() => void exercisesQuery.fetchNextPage()}
            style={styles.loadMoreButton}
          >
            {exercisesQuery.isFetchingNextPage ? (
              <ActivityIndicator accessibilityLabel="Cargando más ejercicios" />
            ) : (
              <Text style={styles.loadMoreText}>Cargar más</Text>
            )}
          </Pressable>
        ) : (
          <View style={styles.footerSpace} />
        )
      }
      ListHeaderComponent={header}
      renderItem={({ item }) => (
        <ExerciseCard exercise={item} onOpen={setSelectedExerciseId} />
      )}
      style={styles.container}
    />
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 48,
    justifyContent: 'center',
  },
  backButtonText: {
    color: '#075bff',
    fontSize: 15,
    fontWeight: '700',
  },
  centered: {
    alignItems: 'center',
    backgroundColor: '#f6f8fc',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  chevron: {
    color: '#075bff',
    fontSize: 28,
    fontWeight: '500',
    marginLeft: 12,
  },
  clearButton: {
    justifyContent: 'center',
    minHeight: 48,
    paddingLeft: 12,
  },
  clearButtonText: {
    color: '#075bff',
    fontSize: 14,
    fontWeight: '700',
  },
  container: {
    backgroundColor: '#f6f8fc',
    flex: 1,
  },
  detailBody: {
    color: '#46556d',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 8,
  },
  detailContent: {
    padding: 24,
    paddingBottom: 48,
  },
  detailSection: {
    borderTopColor: '#dce5f4',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 28,
    paddingTop: 22,
  },
  emptyInline: {
    color: '#66758c',
    fontSize: 15,
    marginTop: 10,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  emptyText: {
    color: '#66758c',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center',
  },
  emptyTitle: {
    color: '#12213a',
    fontSize: 20,
    fontWeight: '800',
  },
  errorText: {
    color: '#b42318',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    textAlign: 'center',
  },
  errorTitle: {
    color: '#12213a',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  exerciseMain: {
    flex: 1,
  },
  exerciseMeta: {
    color: '#075bff',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
  },
  exerciseName: {
    color: '#12213a',
    fontSize: 17,
    fontWeight: '800',
  },
  exerciseRow: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e3e9f3',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 10,
    minHeight: 112,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  exerciseSecondary: {
    color: '#66758c',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  eyebrow: {
    color: '#075bff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  filterChip: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d4deed',
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 14,
  },
  filterChipSelected: {
    backgroundColor: '#075bff',
    borderColor: '#075bff',
  },
  filterChipText: {
    color: '#46556d',
    fontSize: 13,
    fontWeight: '700',
  },
  filterChipTextSelected: {
    color: '#ffffff',
  },
  filterGroup: {
    marginTop: 18,
  },
  filterLabel: {
    color: '#1a2942',
    fontSize: 14,
    fontWeight: '800',
  },
  filterScroller: {
    gap: 8,
    paddingRight: 24,
    paddingTop: 8,
  },
  footerSpace: {
    height: 24,
  },
  listContent: {
    padding: 20,
    paddingBottom: 8,
  },
  loadMoreButton: {
    alignItems: 'center',
    borderColor: '#075bff',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 18,
    minHeight: 48,
  },
  loadMoreText: {
    color: '#075bff',
    fontSize: 15,
    fontWeight: '800',
  },
  loadingText: {
    color: '#526074',
    fontSize: 15,
    marginTop: 12,
  },
  metadataBlock: {
    minWidth: '45%',
    paddingRight: 12,
    paddingVertical: 10,
  },
  metadataGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 20,
  },
  metadataLabel: {
    color: '#66758c',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metadataValue: {
    color: '#12213a',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 4,
  },
  pressed: {
    opacity: 0.64,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#075bff',
    borderRadius: 10,
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 48,
    minWidth: 160,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  relationshipName: {
    color: '#12213a',
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  relationshipRole: {
    color: '#526074',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 12,
  },
  relationshipRow: {
    alignItems: 'center',
    borderBottomColor: '#e8edf5',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 48,
  },
  resultsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 22,
  },
  resultsText: {
    color: '#526074',
    fontSize: 14,
    fontWeight: '700',
  },
  searchButton: {
    alignItems: 'center',
    backgroundColor: '#075bff',
    borderRadius: 10,
    justifyContent: 'center',
    marginLeft: 8,
    minHeight: 48,
    paddingHorizontal: 16,
  },
  searchButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  searchInput: {
    backgroundColor: '#ffffff',
    borderColor: '#d4deed',
    borderRadius: 10,
    borderWidth: 1,
    color: '#12213a',
    flex: 1,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  searchRow: {
    flexDirection: 'row',
    marginTop: 20,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#d4deed',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 48,
    minWidth: 160,
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: '#1a2942',
    fontSize: 15,
    fontWeight: '700',
  },
  sectionTitle: {
    color: '#12213a',
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    color: '#526074',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  title: {
    color: '#12213a',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 6,
  },
});
