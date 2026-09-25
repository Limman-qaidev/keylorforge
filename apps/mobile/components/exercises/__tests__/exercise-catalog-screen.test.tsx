import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { ExerciseCatalogScreen } from '@/components/exercises/exercise-catalog-screen';
import { useAuth } from '@/lib/auth/auth-provider';
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

  it('loads the Spanish catalogue and applies combined search and filters', async () => {
    const { findByText, getByLabelText, getByText } = await renderScreen();

    expect(await findByText('Press de banca')).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(getByLabelText('Buscar ejercicios'), 'sentadilla');
      fireEvent.press(getByLabelText('Filtrar por músculo Pectorales'));
      fireEvent.press(getByLabelText('Filtrar por equipamiento Barra'));
      fireEvent.press(getByText('Buscar'));
    });

    await waitFor(() => {
      expect(listExercises).toHaveBeenLastCalledWith('current-token', {
        equipmentId: 'equipment-1',
        page: 1,
        pageSize: 30,
        primaryMuscleId: 'muscle-1',
        search: 'sentadilla',
      });
    });
  });

  it('loads additional deterministic pages on demand', async () => {
    jest.mocked(listExercises).mockImplementation(async (_token, params) => ({
      items: params.page === 2 ? [secondExercise] : [exercise],
      page: params.page ?? 1,
      page_size: 30,
      total: 2,
      total_pages: 2,
    }));

    const { findByText, getByText } = await renderScreen();

    expect(await findByText('Press de banca')).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByText('Cargar más'));
    });
    expect(await findByText('Sentadilla')).toBeTruthy();
  });

  it('opens normalized exercise detail without images or instruction bodies', async () => {
    const { findByText, getByLabelText } = await renderScreen();

    await findByText('Press de banca');
    await act(async () => {
      fireEvent.press(getByLabelText('Abrir Press de banca'));
    });

    expect(await findByText('DETALLE DEL EJERCICIO')).toBeTruthy();
    expect(await findByText('Principal')).toBeTruthy();
    expect(getExercise).toHaveBeenCalledWith('current-token', 'exercise-1');
  });

  it('surfaces a retryable catalogue error and recovers', async () => {
    jest
      .mocked(listExercises)
      .mockRejectedValueOnce(
        new CatalogApiError('network', 'Sin conexión temporal.'),
      );

    const { findByText, getByText } = await renderScreen();

    expect(await findByText('Sin conexión temporal.')).toBeTruthy();

    jest.mocked(listExercises).mockResolvedValue({
      items: [exercise],
      page: 1,
      page_size: 30,
      total: 1,
      total_pages: 1,
    });

    await act(async () => {
      fireEvent.press(getByText('Reintentar'));
    });

    expect(await findByText('Press de banca')).toBeTruthy();
  });
});
