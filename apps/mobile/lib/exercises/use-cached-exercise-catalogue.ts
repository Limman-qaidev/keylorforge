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
  offlineCatalogueStatus,
  searchOfflineExercises,
  seedOfflineCatalogueFromApi,
} from './offline-catalogue';
import { openOfflineExerciseCatalogue } from './offline-catalogue-adapter';
import type { StartSyncAccess } from '../workouts/start-session-sync';

const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 60 * 1000;
const CACHE_PAGE_SIZE = 100;
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

async function readSnapshot(): Promise<ExerciseCatalogueSnapshot | null> {
  const db = await openOfflineExerciseCatalogue();
  const state = await offlineCatalogueStatus(db);
  if (state.state === 'unseeded') return null;
  const items: ExerciseListItem[] = [];
  for (let offset = 0; offset < state.total; offset += CACHE_PAGE_SIZE) {
    const page = await searchOfflineExercises(db, {
      offset,
      limit: CACHE_PAGE_SIZE,
    });
    if (
      page.total !== state.total ||
      page.items.length !== Math.min(CACHE_PAGE_SIZE, state.total - offset)
    ) {
      throw new Error('Incomplete local exercise snapshot');
    }
    items.push(...page.items);
  }
  return {
    items,
    muscles: references(items, 'primary_muscles'),
    equipment: references(items, 'equipment'),
    seededAtUtc: state.seededAtUtc,
  };
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
    null,
  );
  const [initialized, setInitialized] = useState(Platform.OS === 'web');
  const currentSession = useRef<Session | null>(session);
  const snapshotRef = useRef<ExerciseCatalogueSnapshot | null>(null);
  const inFlight = useRef(false);
  const lastAttempt = useRef(0);

  useEffect(() => {
    currentSession.current = session;
  }, [session]);

  const backgroundUpdate = useCallback(async () => {
    if (Platform.OS === 'web' || inFlight.current) return;
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
        currentSession.current?.user.id ?? null,
      acquireCurrentCredentials: async () => {
        const active = currentSession.current;
        return active?.access_token && active.user.id
          ? { subject: active.user.id, accessToken: active.access_token }
          : null;
      },
    };
    try {
      const db = await openOfflineExerciseCatalogue();
      await seedOfflineCatalogueFromApi(db, access);
      const next = await readSnapshot();
      if (currentSession.current?.user.id === current.user.id && next) {
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
    void readSnapshot()
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
