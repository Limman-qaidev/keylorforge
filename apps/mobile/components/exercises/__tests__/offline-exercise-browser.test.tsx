import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { OfflineExerciseBrowser } from '../offline-exercise-browser';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  offlineCatalogueStatus,
  searchOfflineExercises,
  seedOfflineCatalogueFromApi,
} from '@/lib/exercises/offline-catalogue';
import { openOfflineExerciseCatalogue } from '@/lib/exercises/offline-catalogue-adapter';
import type { ExerciseListItem } from '@/lib/exercises/catalog-api';

jest.mock('@/lib/auth/auth-provider', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/exercises/offline-catalogue', () => ({
  offlineCatalogueStatus: jest.fn(),
  searchOfflineExercises: jest.fn(),
  seedOfflineCatalogueFromApi: jest.fn(),
}));
jest.mock('@/lib/exercises/offline-catalogue-adapter', () => ({
  openOfflineExerciseCatalogue: jest.fn(),
}));

const MUSCLE = 'muscle-pectoral',
  EQUIPMENT = 'equipment-barbell';
const EXERCISES: ExerciseListItem[] = [
  {
    id: 'exercise-one',
    name: 'Press inclinado',
    measurement_type: 'reps',
    category: 'strength',
    difficulty_level: null,
    primary_muscles: [{ id: MUSCLE, name: 'Pectorales' }],
    equipment: [{ id: EQUIPMENT, name: 'Barra' }],
    alias_ids: [],
  },
  {
    id: 'exercise-two',
    name: 'Remo con polea',
    measurement_type: 'reps',
    category: 'strength',
    difficulty_level: null,
    primary_muscles: [{ id: 'back', name: 'Espalda' }],
    equipment: [{ id: 'cable', name: 'Polea' }],
    alias_ids: [],
  },
  {
    id: 'exercise-three',
    name: 'Prensa de piernas',
    measurement_type: 'reps',
    category: 'strength',
    difficulty_level: null,
    primary_muscles: [{ id: 'legs', name: 'Piernas' }],
    equipment: [{ id: 'press', name: 'Máquina' }],
    alias_ids: [],
  },
];

const ready = {
  state: 'ready' as const,
  total: 3,
  seededAtUtc: '2026-10-09T00:00:00.000Z',
};

function seedData(items = EXERCISES) {
  jest.mocked(offlineCatalogueStatus).mockResolvedValue({
    ...ready,
    total: items.length,
  });
  jest.mocked(searchOfflineExercises).mockImplementation(async (_db, args) => ({
    total: items.length,
    items: items.slice(
      args?.offset ?? 0,
      (args?.offset ?? 0) + (args?.limit ?? 30),
    ),
  }));
}

describe('OfflineExerciseBrowser production integration', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(useAuth).mockReturnValue({
      session: {
        access_token: 'test-token',
        user: { id: 'b35c00d6-243c-4dea-a095-000000000100' },
      },
    } as unknown as ReturnType<typeof useAuth>);
    jest
      .mocked(openOfflineExerciseCatalogue)
      .mockResolvedValue(
        {} as Awaited<ReturnType<typeof openOfflineExerciseCatalogue>>,
      );
    seedData();
    jest.mocked(seedOfflineCatalogueFromApi).mockResolvedValue(ready);
  });

  it('loads a complete local cache without accessing the M2 API', async () => {
    const screen = await render(<OfflineExerciseBrowser />);
    expect(await screen.findByText('Press inclinado')).toBeTruthy();
    expect(screen.getByText('Remo con polea')).toBeTruthy();
    expect(screen.getByText('Prensa de piernas')).toBeTruthy();
    expect(screen.getByTestId('offline-catalogue-status').props.children).toBe(
      'CATÁLOGO DISPONIBLE · 3 ejercicios',
    );
    expect(
      screen.getByTestId('offline-catalogue-results').props.children.join(''),
    ).toBe('3 de 3 ejercicios');
    expect(seedOfflineCatalogueFromApi).not.toHaveBeenCalled();
  });

  it('searches accents/case and filters exercise metadata offline', async () => {
    const screen = await render(<OfflineExerciseBrowser />);
    await screen.findByText('Prensa de piernas');
    await act(async () =>
      fireEvent.changeText(
        screen.getByLabelText('Buscar ejercicios guardados'),
        'PRÉNSA',
      ),
    );
    expect(screen.getByText('Prensa de piernas')).toBeTruthy();
    expect(screen.queryByText('Remo con polea')).toBeNull();
    await act(async () =>
      fireEvent.changeText(
        screen.getByLabelText('Buscar ejercicios guardados'),
        '',
      ),
    );
    await act(async () =>
      fireEvent.press(screen.getByLabelText('Filtrar músculo por Pectorales')),
    );
    expect(screen.getByText('Press inclinado')).toBeTruthy();
    expect(screen.queryByText('Remo con polea')).toBeNull();
    await act(async () =>
      fireEvent.press(screen.getByLabelText('Filtrar equipamiento por Polea')),
    );
    expect(
      screen.getByText(
        'Ningún ejercicio coincide con la búsqueda y los filtros.',
      ),
    ).toBeTruthy();
  });

  it('shows a genuine unseeded state, then manually downloads and uses cached data', async () => {
    jest
      .mocked(offlineCatalogueStatus)
      .mockResolvedValueOnce({ state: 'unseeded' })
      .mockResolvedValue(ready);
    const screen = await render(<OfflineExerciseBrowser />);
    await screen.findByText(
      'Todavía no hay ejercicios guardados en este dispositivo.',
    );
    expect(screen.getByText('CATÁLOGO NO DESCARGADO')).toBeTruthy();
    await act(async () =>
      fireEvent.press(
        screen.getByLabelText('Descargar o actualizar catálogo offline'),
      ),
    );
    expect(await screen.findByText('Prensa de piernas')).toBeTruthy();
    expect(seedOfflineCatalogueFromApi).toHaveBeenCalledTimes(1);
    const [, auth] = jest.mocked(seedOfflineCatalogueFromApi).mock.calls[0]!;
    expect(auth.currentAuthenticatedSubject()).toBe(
      'b35c00d6-243c-4dea-a095-000000000100',
    );
    expect(await auth.acquireCurrentCredentials()).toEqual({
      subject: 'b35c00d6-243c-4dea-a095-000000000100',
      accessToken: 'test-token',
    });
  });

  it('retains all locally visible exercises after a network refresh fails', async () => {
    jest
      .mocked(seedOfflineCatalogueFromApi)
      .mockRejectedValue(new Error('network offline'));
    const screen = await render(<OfflineExerciseBrowser />);
    await screen.findByText('Press inclinado');
    await act(async () =>
      fireEvent.press(
        screen.getByLabelText('Descargar o actualizar catálogo offline'),
      ),
    );
    expect(screen.getByText('Press inclinado')).toBeTruthy();
    expect(screen.getByText('CATÁLOGO DISPONIBLE · 3 ejercicios')).toBeTruthy();
    expect(
      screen.getByText(
        'No se pudo actualizar el catálogo. Si ya estaba descargado, sigue disponible sin conexión.',
      ),
    ).toBeTruthy();
  });

  it('reads multiple local batches and renders count for >100 canonical exercises', async () => {
    const large = Array.from({ length: 101 }, (_, i) => ({
      ...EXERCISES[0]!,
      id: 'exercise-' + i,
      name: 'Press #' + i,
    }));
    seedData(large);
    const screen = await render(<OfflineExerciseBrowser />);
    await waitFor(() => {
      expect(
        screen.getByTestId('offline-catalogue-results').props.children.join(''),
      ).toBe('101 de 101 ejercicios');
    });
    expect(searchOfflineExercises).toHaveBeenCalledTimes(2);
    expect(jest.mocked(searchOfflineExercises).mock.calls[1]![1]).toMatchObject({
      offset: 100,
      limit: 100,
    });
  });

  it('reopens a previously cached snapshot with no automatic download', async () => {
    const first = await render(<OfflineExerciseBrowser />);
    await first.findByText('Press inclinado');
    await first.unmount();
    const second = await render(<OfflineExerciseBrowser />);
    expect(await second.findByText('Remo con polea')).toBeTruthy();
    expect(seedOfflineCatalogueFromApi).not.toHaveBeenCalled();
  });
});
