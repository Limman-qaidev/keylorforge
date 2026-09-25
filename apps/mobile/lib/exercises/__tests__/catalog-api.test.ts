import { requestApi } from '@/lib/api/client';
import {
  CatalogApiError,
  getExercise,
  listEquipment,
  listExercises,
} from '@/lib/exercises/catalog-api';

jest.mock('@/lib/api/client', () => ({
  requestApi: jest.fn(),
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

describe('exercise catalogue API client', () => {
  beforeEach(() => {
    jest.mocked(requestApi).mockReset();
  });

  it('sends localized search, filters and pagination with the bearer token', async () => {
    jest.mocked(requestApi).mockResolvedValue({
      json: async () => ({
        items: [exercise],
        page: 2,
        page_size: 30,
        total: 31,
        total_pages: 2,
      }),
      ok: true,
      status: 200,
    } as Response);

    await expect(
      listExercises('token', {
        equipmentId: 'equipment-1',
        page: 2,
        primaryMuscleId: 'muscle-1',
        search: 'press',
      }),
    ).resolves.toMatchObject({ total: 31 });

    expect(requestApi).toHaveBeenCalledWith(
      '/exercises?locale=es&page=2&page_size=30&search=press&primary_muscle_id=muscle-1&equipment_id=equipment-1',
      { headers: { Authorization: 'Bearer token' } },
    );
  });

  it('validates exercise detail instead of trusting arbitrary payloads', async () => {
    jest.mocked(requestApi).mockResolvedValue({
      json: async () => ({
        ...exercise,
        force_type: 'push',
        mechanics: 'compound',
        muscles: [
          { id: 'muscle-1', name: 'Pectorales', role: 'primary' },
        ],
      }),
      ok: true,
      status: 200,
    } as Response);

    await expect(getExercise('token', 'exercise-1')).resolves.toMatchObject({
      name: 'Press de banca',
      mechanics: 'compound',
    });
  });

  it.each([
    [401, 'auth'],
    [403, 'forbidden'],
    [404, 'notFound'],
    [422, 'validation'],
    [503, 'server'],
  ] as const)('classifies HTTP %i safely', async (status, kind) => {
    jest.mocked(requestApi).mockResolvedValue({
      json: async () => ({ detail: 'provider detail' }),
      ok: false,
      status,
    } as Response);

    await expect(listEquipment('token')).rejects.toMatchObject({
      kind,
    } satisfies Partial<CatalogApiError>);
  });

  it('rejects malformed successful payloads', async () => {
    jest.mocked(requestApi).mockResolvedValue({
      json: async () => ({ items: 'not-an-array' }),
      ok: true,
      status: 200,
    } as Response);

    await expect(listExercises('token', {})).rejects.toMatchObject({
      kind: 'unexpected',
    } satisfies Partial<CatalogApiError>);
  });
});
