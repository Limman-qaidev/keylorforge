/**
 * M3-MOB-008: complete offline read-only snapshot of the canonical M2 catalogue.
 *
 * This is public system reference data; never stores access tokens, account
 * state, user-owned history, or any inferred equivalence between movements.
 * A failed download/identity change leaves the previously committed snapshot.
 */
import {
  listExercises,
  type ExerciseListItem,
  type ExercisePage,
} from './catalog-api';
import type { SqliteWorkoutPort } from '../workouts/local-schema';
import type { LocalSubjectAccess } from '../workouts/local-store';
import type { StartSyncAccess } from '../workouts/start-session-sync';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 100;
const MAX_ITEMS = 20_000;
const LOCALE = 'es';

export type CatalogueSqlitePort = SqliteWorkoutPort & {
  getAllAsync<T>(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<T[]>;
};

type CachedRow = {
  exercise_id: string;
  payload_json: string;
};
type MetaRow = {
  total: number;
  seeded_at_utc: string;
};
export type CachedCatalogueStatus =
  | { state: 'unseeded' }
  | { state: 'ready'; total: number; seededAtUtc: string };
export type CachedExerciseSearch = {
  search?: string;
  primaryMuscleId?: string | null;
  equipmentId?: string | null;
  offset?: number;
  limit?: number;
};
export type CachedExerciseResult = {
  total: number;
  items: ExerciseListItem[];
};
export type DownloadPage = (
  page: number,
  pageSize: number,
) => Promise<ExercisePage>;

export class OfflineCatalogueError extends Error {
  constructor(
    public readonly code:
      | 'notAuthenticated'
      | 'invalidPage'
      | 'invalidSnapshot'
      | 'invalidSearch'
      | 'corruptCache',
  ) {
    super(code);
    this.name = 'OfflineCatalogueError';
  }
}

export const OFFLINE_CATALOGUE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS public_exercise_cache (
  locale TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (locale, exercise_id)
);
CREATE TABLE IF NOT EXISTS public_exercise_cache_meta (
  locale TEXT PRIMARY KEY,
  total INTEGER NOT NULL CHECK (total > 0),
  seeded_at_utc TEXT NOT NULL
);
`;

export async function initializeOfflineCatalogueSchema(
  db: SqliteWorkoutPort,
): Promise<void> {
  await db.execAsync(OFFLINE_CATALOGUE_SCHEMA_SQL);
}

function currentSubject(access: LocalSubjectAccess): string {
  const subject = access.currentAuthenticatedSubject();
  if (!subject || !UUID.test(subject)) {
    throw new OfflineCatalogueError('notAuthenticated');
  }
  return subject.toLowerCase();
}
function guard(access: LocalSubjectAccess, subject: string): void {
  if (currentSubject(access) !== subject) {
    throw new OfflineCatalogueError('notAuthenticated');
  }
}
function reference(value: unknown): value is { id: string; name: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    UUID.test(row.id) &&
    typeof row.name === 'string' &&
    row.name.trim().length > 0
  );
}
function validItem(value: ExerciseListItem): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    UUID.test(value.id) &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    ['reps', 'time', 'distance'].includes(value.measurement_type) &&
    (value.category === null || typeof value.category === 'string') &&
    (value.difficulty_level === null ||
      typeof value.difficulty_level === 'string') &&
    Array.isArray(value.primary_muscles) &&
    value.primary_muscles.every(reference) &&
    Array.isArray(value.equipment) &&
    value.equipment.every(reference) &&
    (value.alias_ids === undefined ||
      (Array.isArray(value.alias_ids) &&
        value.alias_ids.every((id) => typeof id === 'string' && UUID.test(id))))
  );
}
function validatedPage(
  page: ExercisePage,
  expectedPage: number,
  total: number | null,
): boolean {
  if (
    !page ||
    !Number.isSafeInteger(page.page) ||
    page.page !== expectedPage ||
    page.page_size !== PAGE_SIZE ||
    !Number.isSafeInteger(page.total) ||
    page.total <= 0 ||
    page.total > MAX_ITEMS ||
    (total !== null && page.total !== total) ||
    page.total_pages !== Math.ceil(page.total / PAGE_SIZE) ||
    !Array.isArray(page.items)
  )
    return false;
  const start = (page.page - 1) * PAGE_SIZE;
  const expectedLength = Math.min(PAGE_SIZE, page.total - start);
  return (
    expectedLength > 0 &&
    page.items.length === expectedLength &&
    page.items.every(validItem)
  );
}
function checkSnapshot(items: readonly ExerciseListItem[]): void {
  const canonical = new Set<string>();
  const aliases = new Set<string>();
  for (const item of items) {
    const id = item.id.toLowerCase();
    if (canonical.has(id)) throw new OfflineCatalogueError('invalidSnapshot');
    canonical.add(id);
  }
  for (const item of items) {
    for (const rawAlias of item.alias_ids ?? []) {
      const alias = rawAlias.toLowerCase();
      if (canonical.has(alias) || aliases.has(alias)) {
        throw new OfflineCatalogueError('invalidSnapshot');
      }
      aliases.add(alias);
    }
  }
}
function parseCachedRow(row: CachedRow): ExerciseListItem {
  try {
    const item: unknown = JSON.parse(row.payload_json);
    if (
      !validItem(item as ExerciseListItem) ||
      (item as ExerciseListItem).id.toLowerCase() !== row.exercise_id
    ) {
      throw new OfflineCatalogueError('corruptCache');
    }
    return item as ExerciseListItem;
  } catch {
    throw new OfflineCatalogueError('corruptCache');
  }
}

/**
 * Download every page before one exclusive REPLACE transaction.
 * Never set the ready marker until all rows have been validated and inserted.
 */
export async function seedOfflineExerciseCatalogue(
  db: CatalogueSqlitePort,
  access: LocalSubjectAccess,
  fetchPage: DownloadPage,
): Promise<CachedCatalogueStatus> {
  const subject = currentSubject(access);
  const items: ExerciseListItem[] = [];
  let total: number | null = null;
  let pageNumber = 1;
  do {
    guard(access, subject);
    const page = await fetchPage(pageNumber, PAGE_SIZE);
    guard(access, subject);
    if (!validatedPage(page, pageNumber, total)) {
      throw new OfflineCatalogueError('invalidPage');
    }
    total = page.total;
    items.push(...page.items);
    pageNumber++;
  } while (items.length < (total ?? 0));
  if (total === null || items.length !== total) {
    throw new OfflineCatalogueError('invalidSnapshot');
  }
  checkSnapshot(items);
  guard(access, subject);

  const seededAtUtc = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (tx) => {
    guard(access, subject);
    await tx.runAsync(
      'DELETE FROM public_exercise_cache WHERE locale = ?',
      LOCALE,
    );
    guard(access, subject);
    for (const item of items) {
      await tx.runAsync(
        'INSERT INTO public_exercise_cache (locale, exercise_id, payload_json) VALUES (?, ?, ?)',
        LOCALE,
        item.id.toLowerCase(),
        JSON.stringify(item),
      );
      guard(access, subject);
    }
    await tx.runAsync(
      'INSERT OR REPLACE INTO public_exercise_cache_meta (locale, total, seeded_at_utc) VALUES (?, ?, ?)',
      LOCALE,
      total,
      seededAtUtc,
    );
    guard(access, subject);
  });
  guard(access, subject);
  return { state: 'ready', total, seededAtUtc };
}

/** Authenticated bootstrap using the existing M2 read-only catalogue API. */
export async function seedOfflineCatalogueFromApi(
  db: CatalogueSqlitePort,
  access: StartSyncAccess,
): Promise<CachedCatalogueStatus> {
  const subject = currentSubject(access);
  const credentials = await access.acquireCurrentCredentials();
  guard(access, subject);
  if (
    !credentials ||
    credentials.subject.toLowerCase() !== subject ||
    !credentials.accessToken
  ) {
    throw new OfflineCatalogueError('notAuthenticated');
  }
  return seedOfflineExerciseCatalogue(db, access, (page, pageSize) =>
    listExercises(credentials.accessToken, { page, pageSize }),
  );
}

export async function offlineCatalogueStatus(
  db: CatalogueSqlitePort,
): Promise<CachedCatalogueStatus> {
  const meta = await db.getFirstAsync<MetaRow>(
    'SELECT total, seeded_at_utc FROM public_exercise_cache_meta WHERE locale = ?',
    LOCALE,
  );
  if (!meta) return { state: 'unseeded' };
  const count = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM public_exercise_cache WHERE locale = ?',
    LOCALE,
  );
  if (
    !count ||
    count.count !== meta.total ||
    meta.total <= 0 ||
    !Number.isSafeInteger(meta.total) ||
    !Number.isFinite(Date.parse(meta.seeded_at_utc))
  ) {
    throw new OfflineCatalogueError('corruptCache');
  }
  return { state: 'ready', total: meta.total, seededAtUtc: meta.seeded_at_utc };
}

function folded(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');
}

/** Offline read of previously committed public reference data, no token needed. */
export async function searchOfflineExercises(
  db: CatalogueSqlitePort,
  options: CachedExerciseSearch = {},
): Promise<CachedExerciseResult> {
  const offset = options.offset ?? 0;
  const limit = options.limit ?? 30;
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (options.primaryMuscleId != null && !UUID.test(options.primaryMuscleId)) ||
    (options.equipmentId != null && !UUID.test(options.equipmentId))
  ) {
    throw new OfflineCatalogueError('invalidSearch');
  }
  if ((await offlineCatalogueStatus(db)).state === 'unseeded') {
    return { total: 0, items: [] };
  }
  const rows = await db.getAllAsync<CachedRow>(
    'SELECT exercise_id, payload_json FROM public_exercise_cache WHERE locale = ?',
    LOCALE,
  );
  const query = folded(options.search?.trim() ?? '');
  const results = rows
    .map(parseCachedRow)
    .filter(
      (item) =>
        (!query || folded(item.name).includes(query)) &&
        (!options.primaryMuscleId ||
          item.primary_muscles.some(
            (muscle) =>
              muscle.id.toLowerCase() ===
              options.primaryMuscleId!.toLowerCase(),
          )) &&
        (!options.equipmentId ||
          item.equipment.some(
            (eq) => eq.id.toLowerCase() === options.equipmentId!.toLowerCase(),
          )),
    )
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name, 'es') ||
        left.id.localeCompare(right.id),
    );
  return {
    total: results.length,
    items: results.slice(offset, offset + limit),
  };
}

/**
 * Hydrate the entire committed public snapshot in ONE native SQLite read.
 * The old page-loop repeatedly read/parsed/sorted every row for each page:
 * O(N * ceil(N/100)) reads/decodes and substantial startup latency.
 *
 * Fail closed on a missing, incomplete or damaged cache; this never writes
 * data and a concurrent refresh cannot expose a partially committed seed.
 */
export async function readOfflineExerciseSnapshot(
  db: CatalogueSqlitePort,
): Promise<{ items: ExerciseListItem[]; seededAtUtc: string } | null> {
  const status = await offlineCatalogueStatus(db);
  if (status.state === 'unseeded') return null;

  const rows = await db.getAllAsync<CachedRow>(
    'SELECT exercise_id, payload_json FROM public_exercise_cache WHERE locale = ?',
    LOCALE,
  );
  if (rows.length !== status.total) {
    throw new OfflineCatalogueError('corruptCache');
  }
  const items = rows.map(parseCachedRow);
  try {
    checkSnapshot(items);
  } catch {
    throw new OfflineCatalogueError('corruptCache');
  }
  items.sort(
    (left, right) =>
      left.name.localeCompare(right.name, 'es') ||
      left.id.localeCompare(right.id),
  );
  return { items, seededAtUtc: status.seededAtUtc };
}

export async function resolveOfflineCanonicalExercise(
  db: CatalogueSqlitePort,
  rawId: string,
): Promise<ExerciseListItem | null> {
  if (!UUID.test(rawId)) throw new OfflineCatalogueError('invalidSearch');
  if ((await offlineCatalogueStatus(db)).state === 'unseeded') return null;
  const rows = await db.getAllAsync<CachedRow>(
    'SELECT exercise_id, payload_json FROM public_exercise_cache WHERE locale = ?',
    LOCALE,
  );
  const requested = rawId.toLowerCase();
  for (const row of rows) {
    const item = parseCachedRow(row);
    if (
      item.id.toLowerCase() === requested ||
      item.alias_ids?.some((id) => id.toLowerCase() === requested)
    )
      return item;
  }
  return null;
}
