import {
  listExercises,
  type ExerciseListItem,
} from '../catalog-api';
import {
  type CatalogueSqlitePort,
  type DownloadPage,
  OfflineCatalogueError,
  offlineCatalogueStatus,
  resolveOfflineCanonicalExercise,
  searchOfflineExercises,
  seedOfflineCatalogueFromApi,
  seedOfflineExerciseCatalogue,
} from '../offline-catalogue';
import type { SqliteQueryPort } from '../../workouts/local-schema';
import type { StartSyncAccess } from '../../workouts/start-session-sync';

jest.mock('../catalog-api', () => ({
  listExercises: jest.fn(),
}));

const A = 'a3dbf764-e0e3-41aa-9895-6e58eadfbb14';
const B = 'e426dd13-344a-4b69-8920-cb014715c6c1';
const MUSCLE = 'c0b9a4dd-19bd-4580-8c5e-0f27194a118e';
const EQUIPMENT = 'f58c6a7b-0d7b-4556-8489-b2b1c430dcd2';
const ALIAS = '3bfae4d9-24f5-48fa-a506-36f4a72de246';
const ID = (index: number) =>
  `9f67e8d3-8929-4235-9e74-${index.toString(16).padStart(12, '0')}`;

function exercise(index: number): ExerciseListItem {
  return {
    id: ID(index),
    name: index % 2 ? `Prensa de piernas ${index}` : `Remo sentado ${index}`,
    measurement_type: index % 2 ? 'reps' : 'time',
    difficulty_level: null,
    category: 'strength',
    primary_muscles: index % 2 ? [{ id: MUSCLE, name: 'Piernas' }] : [],
    equipment: index % 2 ? [{ id: EQUIPMENT, name: 'Máquina' }] : [],
    alias_ids: index === 1 ? [ALIAS] : [],
  };
}
function pages(count = 103): DownloadPage {
  const all = Array.from({ length: count }, (_, index) => exercise(index + 1));
  return async (page, pageSize) => ({
    page,
    page_size: pageSize,
    total: count,
    total_pages: Math.ceil(count / pageSize),
    items: all.slice((page - 1) * pageSize, page * pageSize),
  });
}

class FakeDB implements CatalogueSqlitePort {
  readonly cache = new Map<string, string>();
  meta: { total: number; seeded_at_utc: string } | null = null;
  failAt = 0;
  writes = 0;
  onWrite?: () => void;

  async execAsync(): Promise<void> {}
  async getFirstAsync<T>(sql: string): Promise<T | null> {
    if (sql.includes('public_exercise_cache_meta')) {
      return (this.meta && { ...this.meta }) as T | null;
    }
    if (sql.includes('COUNT(*)')) {
      return { count: this.cache.size } as T;
    }
    throw new Error('unexpected SELECT ' + sql);
  }
  async getAllAsync<T>(sql: string): Promise<T[]> {
    if (!sql.includes('public_exercise_cache')) {
      throw new Error('unexpected getAll ' + sql);
    }
    return [...this.cache.entries()].map(
      ([exercise_id, payload_json]) => ({ exercise_id, payload_json }) as T,
    );
  }
  async runAsync(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<unknown> {
    this.writes++;
    if (this.failAt === this.writes) throw new Error('disk full');
    if (sql.startsWith('DELETE FROM public_exercise_cache')) {
      this.cache.clear();
    } else if (sql.startsWith('INSERT INTO public_exercise_cache ')) {
      const id = String(params[1]);
      if (this.cache.has(id)) throw new Error('duplicate');
      this.cache.set(id, String(params[2]));
    } else if (
      sql.startsWith('INSERT OR REPLACE INTO public_exercise_cache_meta')
    ) {
      this.meta = {
        total: Number(params[1]),
        seeded_at_utc: String(params[2]),
      };
    } else {
      throw new Error('unexpected write ' + sql);
    }
    this.onWrite?.();
    return undefined;
  }
  async withExclusiveTransactionAsync(
    f: (tx: SqliteQueryPort) => Promise<void>,
  ): Promise<void> {
    const prior = new Map(this.cache);
    const previousMeta = this.meta && { ...this.meta };
    try {
      await f(this);
    } catch (error) {
      this.cache.clear();
      prior.forEach((v, k) => this.cache.set(k, v));
      this.meta = previousMeta;
      throw error;
    }
  }
}
function auth() {
  let subject: string | null = A;
  let credentialsSubject = A;
  let token: string | null = 'token';
  const access: StartSyncAccess = {
    currentAuthenticatedSubject: () => subject,
    acquireCurrentCredentials: async () =>
      token ? { subject: credentialsSubject, accessToken: token } : null,
  };
  return {
    access,
    switchTo: (value: string | null) => {
      subject = value;
    },
    wrongCredentials: () => {
      credentialsSubject = B;
    },
    noToken: () => {
      token = null;
    },
  };
}

describe('M3 complete and atomic offline canonical exercise cache', () => {
  beforeEach(() => jest.mocked(listExercises).mockReset());

  it('seeds complete 103-record snapshot over two pages and reads it offline', async () => {
    const db = new FakeDB(),
      access = auth();
    expect(await offlineCatalogueStatus(db)).toEqual({ state: 'unseeded' });
    const seeded = await seedOfflineExerciseCatalogue(
      db,
      access.access,
      pages(),
    );
    expect(seeded).toMatchObject({ state: 'ready', total: 103 });
    expect(db.cache.size).toBe(103);
    expect(await offlineCatalogueStatus(db)).toEqual(seeded);
    const matches = await searchOfflineExercises(db, {
      search: 'prensa',
      primaryMuscleId: MUSCLE,
      equipmentId: EQUIPMENT,
      limit: 100,
    });
    expect(matches.total).toBe(52);
    expect(matches.items.every((v) => v.name.startsWith('Prensa'))).toBe(true);
    expect(
      (
        await searchOfflineExercises(db, {
          search: 'REMO',
          offset: 2,
          limit: 3,
        })
      ).items,
    ).toHaveLength(3);
    expect((await resolveOfflineCanonicalExercise(db, ALIAS))?.id).toBe(ID(1));
    expect((await resolveOfflineCanonicalExercise(db, ID(1)))?.id).toBe(ID(1));
    expect(await resolveOfflineCanonicalExercise(db, ID(900))).toBeNull();
  });

  it('bootstrap with current authenticated token, never save it', async () => {
    const db = new FakeDB(),
      access = auth();
    jest.mocked(listExercises).mockImplementation(async (token, query) => {
      expect(token).toBe('token');
      return pages(1)(query.page ?? 1, query.pageSize ?? 30);
    });
    expect(await seedOfflineCatalogueFromApi(db, access.access)).toMatchObject({
      state: 'ready',
      total: 1,
    });
    expect([...db.cache.values()].join('')).not.toContain('token');
    expect(jest.mocked(listExercises)).toHaveBeenCalledWith('token', {
      page: 1,
      pageSize: 100,
    });
  });

  it('never replaces an existing complete snapshot with half-downloaded data', async () => {
    const db = new FakeDB(),
      access = auth();
    await seedOfflineExerciseCatalogue(db, access.access, pages(3));
    const original = new Map(db.cache);
    const originalMeta = { ...db.meta! };
    for (const bad of [
      async () => ({ ...(await pages(103)(1, 100)), total_pages: 1 }),
      async () => ({ ...(await pages(103)(1, 100)), items: [exercise(1)] }),
      async () => ({
        ...(await pages(103)(1, 100)),
        items: [
          ...Array.from({ length: 99 }, (_, i) => exercise(i + 1)),
          exercise(1),
        ],
      }),
    ]) {
      await expect(
        seedOfflineExerciseCatalogue(db, access.access, async (page, size) =>
          page === 1 ? bad() : pages(103)(page, size),
        ),
      ).rejects.toBeInstanceOf(OfflineCatalogueError);
      expect(db.cache).toEqual(original);
      expect(db.meta).toEqual(originalMeta);
    }
  });

  it('preserves old snapshot on changed count, page rejection and transient outage', async () => {
    const db = new FakeDB(),
      access = auth();
    await seedOfflineExerciseCatalogue(db, access.access, pages(3));
    for (const reason of ['count', 'outage'] as const) {
      await expect(
        seedOfflineExerciseCatalogue(db, access.access, async (page, size) => {
          if (page === 2 && reason === 'outage') throw new Error('offline');
          const result = await pages(103)(page, size);
          return page === 2 && reason === 'count'
            ? { ...result, total: 104 }
            : result;
        }),
      ).rejects.toThrow();
      expect((await offlineCatalogueStatus(db)).state).toBe('ready');
      expect(db.cache.size).toBe(3);
    }
  });

  it('rejects duplicate alias IDs and canonical collisions without replacing data', async () => {
    const db = new FakeDB(),
      access = auth();
    await seedOfflineExerciseCatalogue(db, access.access, pages(1));
    const prior = new Map(db.cache);
    for (const alias of [ALIAS, ID(1)]) {
      await expect(
        seedOfflineExerciseCatalogue(db, access.access, async () => ({
          page: 1,
          page_size: 100,
          total: 2,
          total_pages: 1,
          items: [
            { ...exercise(1), alias_ids: [alias] },
            { ...exercise(2), alias_ids: [alias] },
          ],
        })),
      ).rejects.toMatchObject({ code: 'invalidSnapshot' });
      expect(db.cache).toEqual(prior);
    }
  });

  it('rolls back deleted rows if SQLite disk fails during replacement', async () => {
    const db = new FakeDB(),
      access = auth();
    await seedOfflineExerciseCatalogue(db, access.access, pages(3));
    const original = new Map(db.cache);
    const meta = { ...db.meta! };
    db.failAt = db.writes + 3;
    await expect(
      seedOfflineExerciseCatalogue(db, access.access, pages(103)),
    ).rejects.toThrow('disk full');
    expect(db.cache).toEqual(original);
    expect(db.meta).toEqual(meta);
  });

  it('fences identity changes during downloading or local replacement', async () => {
    for (const phase of ['download', 'write'] as const) {
      const db = new FakeDB(),
        access = auth();
      await seedOfflineExerciseCatalogue(db, access.access, pages(2));
      const old = new Map(db.cache);
      if (phase === 'write') {
        db.onWrite = () => access.switchTo(B);
      }
      await expect(
        seedOfflineExerciseCatalogue(db, access.access, async (page, size) => {
          if (phase === 'download' && page === 1) access.switchTo(B);
          return pages(3)(page, size);
        }),
      ).rejects.toMatchObject({ code: 'notAuthenticated' });
      expect(db.cache).toEqual(old);
    }
  });

  it('does not call M2 API for missing/wrong-account tokens', async () => {
    const db = new FakeDB();
    const absent = auth();
    absent.noToken();
    await expect(
      seedOfflineCatalogueFromApi(db, absent.access),
    ).rejects.toMatchObject({ code: 'notAuthenticated' });
    const wrong = auth();
    wrong.wrongCredentials();
    await expect(
      seedOfflineCatalogueFromApi(db, wrong.access),
    ).rejects.toMatchObject({ code: 'notAuthenticated' });
    expect(listExercises).not.toHaveBeenCalled();
  });

  it('keeps public cached reference read-only and shared across account switches', async () => {
    const db = new FakeDB(),
      account = auth();
    await seedOfflineExerciseCatalogue(db, account.access, pages(1));
    account.switchTo(B);
    expect((await searchOfflineExercises(db, { search: 'Prensa' })).total).toBe(
      1,
    );
    account.switchTo(null);
    expect((await resolveOfflineCanonicalExercise(db, ALIAS))?.id).toBe(ID(1));
  });

  it('rejects invalid offline lookup and detects incomplete committed count', async () => {
    const db = new FakeDB();
    await expect(
      searchOfflineExercises(db, { limit: 101 }),
    ).rejects.toMatchObject({ code: 'invalidSearch' });
    await expect(
      resolveOfflineCanonicalExercise(db, 'name'),
    ).rejects.toMatchObject({ code: 'invalidSearch' });
    await seedOfflineExerciseCatalogue(db, auth().access, pages(2));
    db.cache.delete(ID(2));
    await expect(offlineCatalogueStatus(db)).rejects.toMatchObject({
      code: 'corruptCache',
    });
  });
});
