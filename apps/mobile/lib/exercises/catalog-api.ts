import { requestApi } from '@/lib/api/client';

export type CatalogueReference = {
  id: string;
  name: string;
};

export type ExerciseMuscleReference = CatalogueReference & {
  role: string;
};

export type ExerciseListItem = {
  id: string;
  name: string;
  measurement_type: string;
  difficulty_level: string | null;
  category: string | null;
  primary_muscles: CatalogueReference[];
  equipment: CatalogueReference[];
};

export type ExerciseDetail = ExerciseListItem & {
  force_type: string | null;
  mechanics: string | null;
  muscles: ExerciseMuscleReference[];
};

export type ExercisePage = {
  items: ExerciseListItem[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

export type ExerciseListParams = {
  search?: string;
  primaryMuscleId?: string;
  equipmentId?: string;
  page?: number;
  pageSize?: number;
};

export type CatalogApiErrorKind =
  | 'auth'
  | 'forbidden'
  | 'notFound'
  | 'validation'
  | 'server'
  | 'network'
  | 'unexpected';

export class CatalogApiError extends Error {
  constructor(
    public readonly kind: CatalogApiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'CatalogApiError';
  }
}

function isReference(payload: unknown): payload is CatalogueReference {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const { id, name } = payload as Record<string, unknown>;
  return typeof id === 'string' && typeof name === 'string';
}

function isExerciseListItem(payload: unknown): payload is ExerciseListItem {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const item = payload as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.measurement_type === 'string' &&
    (typeof item.difficulty_level === 'string' ||
      item.difficulty_level === null) &&
    (typeof item.category === 'string' || item.category === null) &&
    Array.isArray(item.primary_muscles) &&
    item.primary_muscles.every(isReference) &&
    Array.isArray(item.equipment) &&
    item.equipment.every(isReference)
  );
}

function isExerciseDetail(payload: unknown): payload is ExerciseDetail {
  if (!isExerciseListItem(payload)) {
    return false;
  }

  const detail = payload as unknown as Record<string, unknown>;
  return (
    (typeof detail.force_type === 'string' || detail.force_type === null) &&
    (typeof detail.mechanics === 'string' || detail.mechanics === null) &&
    Array.isArray(detail.muscles) &&
    detail.muscles.every((muscle) => {
      if (!isReference(muscle)) {
        return false;
      }
      return (
        typeof (muscle as Record<string, unknown>).role === 'string'
      );
    })
  );
}

function isExercisePage(payload: unknown): payload is ExercisePage {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const page = payload as Record<string, unknown>;
  return (
    Array.isArray(page.items) &&
    page.items.every(isExerciseListItem) &&
    typeof page.page === 'number' &&
    typeof page.page_size === 'number' &&
    typeof page.total === 'number' &&
    typeof page.total_pages === 'number'
  );
}

async function errorDetail(response: Response): Promise<string | null> {
  try {
    const payload: unknown = await response.json();
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'detail' in payload &&
      typeof payload.detail === 'string'
    ) {
      return payload.detail;
    }
  } catch {
    // Error bodies are optional.
  }

  return null;
}

async function parseResponse(response: Response): Promise<unknown> {
  if (response.ok) {
    return response.json();
  }

  const detail = await errorDetail(response);

  if (response.status === 401) {
    throw new CatalogApiError(
      'auth',
      'Tu sesión ha terminado. Vuelve a iniciar sesión.',
    );
  }

  if (response.status === 403) {
    throw new CatalogApiError(
      'forbidden',
      'Tu cuenta no puede acceder al catálogo.',
    );
  }

  if (response.status === 404) {
    throw new CatalogApiError(
      'notFound',
      'El ejercicio solicitado ya no está disponible.',
    );
  }

  if (response.status === 422) {
    throw new CatalogApiError(
      'validation',
      detail ?? 'Los filtros del catálogo no son válidos.',
    );
  }

  if (response.status >= 500) {
    throw new CatalogApiError(
      'server',
      'El catálogo no está disponible temporalmente. Inténtalo de nuevo.',
    );
  }

  throw new CatalogApiError(
    'unexpected',
    detail ?? 'No se pudo cargar el catálogo.',
  );
}

function headers(accessToken: string): HeadersInit {
  return { Authorization: 'Bearer ' + accessToken };
}

function queryString(params: ExerciseListParams): string {
  const query = new URLSearchParams();
  query.set('locale', 'es');
  query.set('page', String(params.page ?? 1));
  query.set('page_size', String(params.pageSize ?? 30));

  const search = params.search?.trim();
  if (search) {
    query.set('search', search);
  }
  if (params.primaryMuscleId) {
    query.set('primary_muscle_id', params.primaryMuscleId);
  }
  if (params.equipmentId) {
    query.set('equipment_id', params.equipmentId);
  }

  return query.toString();
}

export async function listExercises(
  accessToken: string,
  params: ExerciseListParams,
): Promise<ExercisePage> {
  try {
    const response = await requestApi('/exercises?' + queryString(params), {
      headers: headers(accessToken),
    });
    const payload = await parseResponse(response);
    if (!isExercisePage(payload)) {
      throw new CatalogApiError(
        'unexpected',
        'El catálogo devolvió una respuesta inesperada.',
      );
    }
    return payload;
  } catch (error) {
    if (error instanceof CatalogApiError) {
      throw error;
    }
    throw new CatalogApiError(
      'network',
      'No se pudo conectar con el catálogo. Comprueba tu conexión e inténtalo de nuevo.',
    );
  }
}

export async function getExercise(
  accessToken: string,
  exerciseId: string,
): Promise<ExerciseDetail> {
  try {
    const response = await requestApi(
      '/exercises/' + encodeURIComponent(exerciseId) + '?locale=es',
      { headers: headers(accessToken) },
    );
    const payload = await parseResponse(response);
    if (!isExerciseDetail(payload)) {
      throw new CatalogApiError(
        'unexpected',
        'El detalle del ejercicio devolvió una respuesta inesperada.',
      );
    }
    return payload;
  } catch (error) {
    if (error instanceof CatalogApiError) {
      throw error;
    }
    throw new CatalogApiError(
      'network',
      'No se pudo cargar el ejercicio. Comprueba tu conexión e inténtalo de nuevo.',
    );
  }
}

async function listReferences(
  accessToken: string,
  endpoint: '/muscles' | '/equipment',
): Promise<CatalogueReference[]> {
  try {
    const response = await requestApi(endpoint + '?locale=es', {
      headers: headers(accessToken),
    });
    const payload = await parseResponse(response);
    if (!Array.isArray(payload) || !payload.every(isReference)) {
      throw new CatalogApiError(
        'unexpected',
        'El catálogo devolvió una respuesta inesperada.',
      );
    }
    return payload;
  } catch (error) {
    if (error instanceof CatalogApiError) {
      throw error;
    }
    throw new CatalogApiError(
      'network',
      'No se pudieron cargar los filtros del catálogo.',
    );
  }
}

export function listMuscles(
  accessToken: string,
): Promise<CatalogueReference[]> {
  return listReferences(accessToken, '/muscles');
}

export function listEquipment(
  accessToken: string,
): Promise<CatalogueReference[]> {
  return listReferences(accessToken, '/equipment');
}
