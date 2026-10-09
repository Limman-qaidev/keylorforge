/**
 * Installation-wide public canonical reference cache, independent of all
 * subject-partitioned workout SQLite databases. Never clear workout data here.
 */
import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';

import {
  initializeOfflineCatalogueSchema,
  type CatalogueSqlitePort,
} from './offline-catalogue';

const CACHE_FILE = 'keylorforge-system-exercise-cache.db';
let opened: Promise<CatalogueSqlitePort> | null = null;

async function openNativeCatalogue(): Promise<CatalogueSqlitePort> {
  if (Platform.OS === 'web') {
    throw new Error('M3 offline catalogue requires native SQLite.');
  }
  const database = await SQLite.openDatabaseAsync(CACHE_FILE);
  try {
    await database.execAsync('PRAGMA journal_mode = WAL;');
    await initializeOfflineCatalogueSchema(database as CatalogueSqlitePort);
    return database as CatalogueSqlitePort;
  } catch (error) {
    await database.closeAsync();
    throw error;
  }
}

/** Open once per JS process. Failed attempts are safe to retry. */
export function openOfflineExerciseCatalogue(): Promise<CatalogueSqlitePort> {
  if (!opened) {
    opened = openNativeCatalogue().catch((error: unknown) => {
      opened = null;
      throw error;
    });
  }
  return opened;
}
