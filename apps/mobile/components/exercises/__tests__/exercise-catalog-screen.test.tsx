import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  userEvent,
  waitFor,
} from '@testing-library/react-native';

import { ExerciseCatalogScreen } from '@/components/exercises/exercise-catalog-screen';
import { useAuth } from '@/lib/auth/auth-provider';
import { useCachedExerciseCatalogue } from '@/lib/exercises/use-cached-exercise-catalogue';
import {
  CatalogApiError,
  getExercise,
  listEquipment,
  listExercises,
  listMuscles,
} from '@/lib/exercises/catalog-api';

jest.mock('@/lib/auth/auth-provider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/exercises/use-cached-exercise-catalogue', () => ({
  useCachedExerciseCatalogue: jest.fn(),
}));

jest.mock('@/lib/exercises/catalog-api', () => ({
  ...jest.requireActual('@/lib/exercises/catalog-api'),
  getExercise: jest.fn(),
  listEquipment: jest.fn(),
  listExercises: jest.fn(),
  listMuscles: jest.fn(),
}));

const exercise = {
  id: 'exercise-1',
  name: 'Press de banca',
  measurement_type: 'reps',
  difficulty_level: 'intermediate',
  category: 'strength',
  primary_muscles: [{ id: 'muscle-1', name: 'Pectorales' }],
  equipment: [{ id: 'equipment-1', name: 'Barra' }],
};

const secondExercise = {
  ...exercise,
  id: 'exercise-2',
  name: 'Sentadilla',
};

function queryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity, retry: false },
    },
  });
}

async function renderScreen() {
  const client = queryClient();
  return render(
    <QueryClientProvider client={client}>
      <ExerciseCatalogScreen />
    </QueryClientProvider>,
  );
}

function authValue() {
  return {
    invalidateSession: jest.fn().mockResolvedValue(undefined),
    refreshSession: jest.fn().mockResolvedValue('refreshed-token'),
    session: {
      access_token: 'current-token',
      user: { id: 'user-1' },
    },
  } as unknown as ReturnType<typeof useAuth>;
}

describe('ExerciseCatalogScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useAuth).mockReturnValue(authValue());
    jest.mocked(useCachedExerciseCatalogue).mockReturnValue({
      snapshot: null,
      initialized: true,
    });
    jest
      .mocked(listMuscles)
      .mockResolvedValue([{ id: 'muscle-1', name: 'Pectorales' }]);
    jest
      .mocked(listEquipment)
      .mockResolvedValue([{ id: 'equipment-1', name: 'Barra' }]);
    jest.mocked(listExercises).mockResolvedValue({
      items: [exercise],
      page: 1,
      page_size: 30,
      total: 1,
      total_pages: 1,
    });
    jest.mocked(getExercise).mockResolvedValue({
      ...exercise,
      force_type: 'push',
      mechanics: 'compound',
      muscles: [{ id: 'muscle-1', name: 'Pectorales', role: 'primary' }],
    });
  });

  it('uses the exact same normal catalogue UI and filters from native cache with no API list calls', async () => {
    jest.mocked(useCachedExerciseCatalogue).mockReturnValue({
      snapshot: {
        items: [exercise, secondExercise],
        muscles: [{ id: 'muscle-1', name: 'Pectorales' }],
        equipment: [{ id: 'equipment-1', name: 'Barra' }],
        seededAtUtc: '2026-10-09T10:00:00.000Z',
      },
      initialized: true,
    });
    const { getByText, queryByText, getByLabelText } = await renderScreen();

    expect(getByText('Catálogo de ejercicios')).toBeTruthy();
    expect(getByText('Press de banca')).toBeTruthy();
    expect(getByText('Sentadilla')).toBeTruthy();
    expect(queryByText('Ejercicios sin conexión')).toBeNull();
    expect(queryByText('Descargar / actualizar catálogo')).toBeNull();
    expect(listExercises).not.toHaveBeenCalled();
    expect(listMuscles).not.toHaveBeenCalled();
    expect(listEquipment).not.toHaveBeenCalled();

    await act(async () =>
      fireEvent.press(getByLabelText('Filtrar por músculo Pectorales')),
    );
    expect(getByText('Press de banca')).toBeTruthy();
    await act(async () =>
      fireEvent.changeText(getByLabelText('Buscar ejercicios'), 'SENTADILLA'),
    );
    await act(async () => fireEvent.press(getByText('Buscar')));
    expect(getByText('Sentadilla')).toBeTruthy();
    expect(listExercises).not.toHaveBeenCalled();
  });

  it('opens an immediate offline summary detail in the same DetailView without inventing fields', async () => {
    jest.mocked(useCachedExerciseCatalogue).mockReturnValue({
      snapshot: {
        items: [exercise],
        muscles: [{ id: 'muscle-1', name: 'Pectorales' }],
        equipment: [{ id: 'equipment-1', name: 'Barra' }],
        seededAtUtc: '2026-10-09T10:00:00.000Z',
      },
      initialized: true,
    });
    jest
      .mocked(getExercise)
      .mockRejectedValueOnce(new CatalogApiError('network', 'Sin Internet'));
    const { getByText, getAllByText, getByLabelText, findByText } =
      await renderScreen();
    await act(async () =>
      fireEvent.press(getByLabelText('Abrir Press de banca')),
    );
    expect(await findByText('DETALLE DEL EJERCICIO')).toBeTruthy();
    expect(getByText('Medición')).toBeTruthy();
    expect(getAllByText('No especificado').length).toBeGreaterThan(0);
    expect(getByText('Pectorales')).toBeTruthy();
  });

  it('waits for native SQLite status rather than flashing a network error', async () => {
    jest.mocked(useCachedExerciseCatalogue).mockReturnValue({
      snapshot: null,
      initialized: false,
    });
    const { getByLabelText } = await renderScreen();
    expect(getByLabelText('Cargando catálogo')).toBeTruthy();
    expect(listExercises).not.toHaveBeenCalled();
  });

  it('loads the Spanish catalogue and applies combined search and filters', async () => {
    const { findByText, getByLabelText, getByText } = await renderScreen();

    expect(await findByText('Press de banca')).toBeTruthy();
    expect(
      getByLabelText('Quitar filtro de músculo').props.accessibilityState,
    ).toEqual({ selected: true });

    await act(async () =>
      fireEvent.press(getByLabelText('Filtrar por músculo Pectorales')),
    );
    expect(
      getByLabelText('Filtrar por músculo Pectorales').props.accessibilityState,
    ).toEqual({ selected: true });
    await waitFor(() => {
      expect(listExercises).toHaveBeenLastCalledWith('current-token', {
        equipmentId: undefined,
        page: 1,
        pageSize: 30,
        primaryMuscleId: 'muscle-1',
        search: undefined,
      });
    });
    expect(await findByText('Press de banca')).toBeTruthy();

    await act(async () =>
      fireEvent.press(getByLabelText('Filtrar por equipamiento Barra')),
    );
    await waitFor(() => {
      expect(listExercises).toHaveBeenLastCalledWith('current-token', {
        equipmentId: 'equipment-1',
        page: 1,
        pageSize: 30,
        primaryMuscleId: 'muscle-1',
        search: undefined,
      });
    });
    expect(await findByText('Press de banca')).toBeTruthy();

    await act(async () =>
      fireEvent.changeText(getByLabelText('Buscar ejercicios'), 'sentadilla'),
    );
    await act(async () => fireEvent.press(getByText('Buscar')));

    await waitFor(() => {
      expect(listExercises).toHaveBeenLastCalledWith('current-token', {
        equipmentId: 'equipment-1',
        page: 1,
        pageSize: 30,
        primaryMuscleId: 'muscle-1',
        search: 'sentadilla',
      });
    });
    expect(await findByText('Press de banca')).toBeTruthy();
  }, 12_000);

  it('loads additional deterministic pages on demand', async () => {
    jest.mocked(listExercises).mockImplementation(async (_token, params) => ({
      items: params.page === 2 ? [secondExercise] : [exercise],
      page: params.page ?? 1,
      page_size: 30,
      total: 2,
      total_pages: 2,
    }));

    const user = userEvent.setup();
    const { findByText, getByText } = await renderScreen();

    expect(await findByText('Press de banca')).toBeTruthy();
    await user.press(getByText('Cargar más'));
    expect(await findByText('Sentadilla')).toBeTruthy();
  });

  it('surfaces a partial filter error and recovers without hiding exercises', async () => {
    jest
      .mocked(listMuscles)
      .mockRejectedValueOnce(
        new CatalogApiError(
          'network',
          'No se pudieron cargar los filtros del catálogo.',
        ),
      );

    const user = userEvent.setup();
    const { findByLabelText, findByText, getByText } = await renderScreen();

    expect(await findByText('Press de banca')).toBeTruthy();
    expect(
      await findByText('No se pudieron cargar los filtros del catálogo.'),
    ).toBeTruthy();

    jest
      .mocked(listMuscles)
      .mockResolvedValue([{ id: 'muscle-1', name: 'Pectorales' }]);

    await user.press(getByText('Reintentar filtros'));

    expect(
      await findByLabelText('Filtrar por músculo Pectorales'),
    ).toBeTruthy();
  });

  it('surfaces a failed next page and retries it explicitly', async () => {
    let secondPageAttempts = 0;
    jest.mocked(listExercises).mockImplementation(async (_token, params) => {
      if (params.page === 2) {
        secondPageAttempts += 1;
        if (secondPageAttempts === 1) {
          throw new CatalogApiError(
            'network',
            'No se pudo cargar la siguiente página.',
          );
        }
        return {
          items: [secondExercise],
          page: 2,
          page_size: 30,
          total: 2,
          total_pages: 2,
        };
      }
      return {
        items: [exercise],
        page: 1,
        page_size: 30,
        total: 2,
        total_pages: 2,
      };
    });

    const user = userEvent.setup();
    const { findByText, getByText } = await renderScreen();

    expect(await findByText('Press de banca')).toBeTruthy();
    await user.press(getByText('Cargar más'));
    expect(
      await findByText('No se pudo cargar la siguiente página.'),
    ).toBeTruthy();

    await user.press(getByText('Reintentar carga'));
    expect(await findByText('Sentadilla')).toBeTruthy();
  });

  it('opens normalized exercise detail without images or instruction bodies', async () => {
    const user = userEvent.setup();
    const { findByText, getAllByText, getByLabelText } = await renderScreen();

    await findByText('Press de banca');
    await user.press(getByLabelText('Abrir Press de banca'));

    expect(await findByText('DETALLE DEL EJERCICIO')).toBeTruthy();
    expect(await findByText('Principal')).toBeTruthy();
    expect(await findByText('Intermedio')).toBeTruthy();
    expect(getAllByText('Fuerza')).toHaveLength(2);
    expect(await findByText('Compuesto')).toBeTruthy();
    expect(await findByText('Empuje')).toBeTruthy();
    expect(getExercise).toHaveBeenCalledWith('current-token', 'exercise-1');
  });

  it('handles a missing exercise detail and allows returning to the catalogue', async () => {
    jest
      .mocked(getExercise)
      .mockRejectedValue(
        new CatalogApiError(
          'notFound',
          'El ejercicio solicitado ya no está disponible.',
        ),
      );

    const user = userEvent.setup();
    const { findByText, getByLabelText, getByText } = await renderScreen();

    await findByText('Press de banca');
    await user.press(getByLabelText('Abrir Press de banca'));

    expect(await findByText('No se pudo abrir el ejercicio')).toBeTruthy();
    expect(
      await findByText('El ejercicio solicitado ya no está disponible.'),
    ).toBeTruthy();

    await user.press(getByText('Volver al catálogo'));
    expect(await findByText('Press de banca')).toBeTruthy();
  });

  it('surfaces a retryable catalogue error and recovers', async () => {
    jest
      .mocked(listExercises)
      .mockRejectedValueOnce(
        new CatalogApiError('network', 'Sin conexión temporal.'),
      );

    const user = userEvent.setup();
    const { findByText, getByText } = await renderScreen();

    expect(await findByText('Sin conexión temporal.')).toBeTruthy();

    jest.mocked(listExercises).mockResolvedValue({
      items: [exercise],
      page: 1,
      page_size: 30,
      total: 1,
      total_pages: 1,
    });

    await user.press(getByText('Reintentar'));

    expect(await findByText('Press de banca')).toBeTruthy();
  });
});
