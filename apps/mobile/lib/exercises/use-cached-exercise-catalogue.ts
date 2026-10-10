/**
 * Automatic native public-catalogue snapshot. Reads SQLite before deciding
 * whether the existing M2 catalogue must use its online API fallback.
 *
 * No UI action, account-owned data, workout SQLite changes, or token storage.
 * Missing snapshots are seeded in the background with fenced credentials.
 * A failed refresh leaves the last committed snapshot intact.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { CatalogueReference, ExerciseListItem } from './catalog-api';
import {
  readOfflineExerciseSnapshot,
  seedOfflineCatalogueFromApi,
} from './offline-catalogue';
import { openOfflineExerciseCatalogue } from './offline-catalogue-adapter';
import type { StartSyncAccess } from '../workouts/start-session-sync';

const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 60 * 1000;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ExerciseCatalogueSnapshot = {
  items: ExerciseListItem[];
  muscles: CatalogueReference[];
  equipment: CatalogueReference[];
  seededAtUtc: string;
};

function references(
  items: readonly ExerciseListItem[],
  key: 'primary_muscles' | 'equipment',
): CatalogueReference[] {
  const unique = new Map<string, string>();
  for (const item of items) {
    for (const ref of item[key]) {
      if (!unique.has(ref.id)) unique.set(ref.id, ref.name);
    }
  }
  return Array.from(unique, ([id, name]) => ({ id, name })).sort((a, b) =>
    a.name.localeCompare(b.name, 'es'),
  );
}

async function readSnapshotFromDisk(): Promise<ExerciseCatalogueSnapshot | null> {
  const db = await openOfflineExerciseCatalogue();
  const cached = await readOfflineExerciseSnapshot(db);
  if (!cached) return null;
  return {
    items: cached.items,
    muscles: references(cached.items, 'primary_muscles'),
    equipment: references(cached.items, 'equipment'),
    seededAtUtc: cached.seededAtUtc,
  };
}

// The canonical catalogue is public, shared across accounts, and immutable
// until an atomic refresh replaces it. Keep one validated JS snapshot across
// navigation mounts; never persist credentials or workout records here.
let memorySnapshot: ExerciseCatalogueSnapshot | null = null;
let pendingHydration: Promise<ExerciseCatalogueSnapshot | null> | null = null;
let snapshotEpoch = 0;

/** Clear only JS memory, never the durable SQLite cache. */
export function invalidateInMemoryExerciseCatalogue(): void {
  memorySnapshot = null;
  pendingHydration = null;
  snapshotEpoch++;
}

/** Eagerly hydrate the public catalogue once while another screen is visible. */
export function preloadExerciseCatalogue(): Promise<ExerciseCatalogueSnapshot | null> {
  if (Platform.OS === 'web') return Promise.resolve(null);
  if (memorySnapshot) return Promise.resolve(memorySnapshot);
  if (pendingHydration) return pendingHydration;

  const requestedEpoch = snapshotEpoch;
  const pending = readSnapshotFromDisk().then((cached) => {
    if (cached && snapshotEpoch === requestedEpoch) memorySnapshot = cached;
    return cached;
  });
  pendingHydration = pending;
  void pending.then(
    () => {
      if (pendingHydration === pending) pendingHydration = null;
    },
    () => {
      if (pendingHydration === pending) pendingHydration = null;
    },
  );
  return pending;
}

function stale(snapshot: ExerciseCatalogueSnapshot | null): boolean {
  return (
    snapshot === null ||
    Date.now() - Date.parse(snapshot.seededAtUtc) >= CACHE_MAX_AGE_MS
  );
}

export function useCachedExerciseCatalogue(session: Session | null): {
  snapshot: ExerciseCatalogueSnapshot | null;
  initialized: boolean;
} {
  const [snapshot, setSnapshot] = useState<ExerciseCatalogueSnapshot | null>(
    () => memorySnapshot,
  );
  const [initialized, setInitialized] = useState(
    Platform.OS === 'web' || memorySnapshot !== null,
  );
  const currentSession = useRef<Session | null>(session);
  const mounted = useRef(true);
  const snapshotRef = useRef<ExerciseCatalogueSnapshot | null>(null);
  const inFlight = useRef(false);
  const lastAttempt = useRef(0);

  useEffect(() => {
    currentSession.current = session;
  }, [session]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const backgroundUpdate = useCallback(async () => {
    if (Platform.OS === 'web' || !mounted.current || inFlight.current) return;
    const current = currentSession.current;
    if (
      !current ||
      !UUID.test(current.user.id) ||
      !current.access_token ||
      !stale(snapshotRef.current) ||
      Date.now() - lastAttempt.current < RETRY_AFTER_MS
    ) {
      return;
    }
    lastAttempt.current = Date.now();
    inFlight.current = true;
    const access: StartSyncAccess = {
      currentAuthenticatedSubject: () =>
        mounted.current ? (currentSession.current?.user.id ?? null) : null,
      acquireCurrentCredentials: async () => {
        const active = mounted.current ? currentSession.current : null;
        return active?.access_token && active.user.id
          ? { subject: active.user.id, accessToken: active.access_token }
          : null;
      },
    };
    try {
      const db = await openOfflineExerciseCatalogue();
      await seedOfflineCatalogueFromApi(db, access);
      // Do not reuse the pre-refresh memory snapshot after a successful
      // atomic SQLite seed. Previous memory stays valid on any failure.
      const next = await readSnapshotFromDisk();
      if (
        mounted.current &&
        currentSession.current?.user.id === current.user.id &&
        next
      ) {
        snapshotEpoch++;
        memorySnapshot = next;
        snapshotRef.current = next;
        setSnapshot(next);
      }
    } catch {
      // Offline, token rotation or a partially received paginated download:
      // the SQLite transaction retains the previous complete snapshot.
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    void preloadExerciseCatalogue()
      .then((cached) => {
        if (!active) return;
        snapshotRef.current = cached;
        setSnapshot(cached);
      })
      .catch(() => {
        // Corrupt/unavailable native cache: fall back to existing M2 API.
        if (active) {
          snapshotRef.current = null;
          setSnapshot(null);
        }
      })
      .finally(() => {
        if (active) {
          setInitialized(true);
          void backgroundUpdate();
        }
      });
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active' && active) void backgroundUpdate();
    });
    // AppState resumes trigger a refresh sooner; while viewing this screen,
    // retry at a capped frequency if connectivity returns without foregrounding.
    const interval = setInterval(() => {
      if (active) void backgroundUpdate();
    }, RETRY_AFTER_MS);
    return () => {
      active = false;
      listener.remove();
      clearInterval(interval);
    };
  }, [backgroundUpdate]);

  return { snapshot, initialized };
}
