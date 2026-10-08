/**
 * Expo SDK 57 SQLite native adapter for the account-partitioned M3 store.
 *
 * The database is shared per installation, but every account-owned SQL query
 * is subject-scoped. Ordinary logout hides a partition; it NEVER drops tables
 * or clears pending mutations. Never use this module as an auth capability.
 */
import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';

import {
  initializeLocalWorkoutSchema,
  LOCAL_WORKOUT_SCHEMA_VERSION,
  type SqliteWorkoutPort,
} from './local-schema';

const DATABASE_NAME = 'keylorforge-m3-workouts.db';
let opened: Promise<SqliteWorkoutPort> | null = null;

async function initializeNativeWorkoutDatabase(): Promise<SqliteWorkoutPort> {
  if (Platform.OS === 'web') {
    throw new Error(
      'M3 native SQLite workout storage is not supported on web.',
    );
  }
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  try {
    // Foreign-key enforcement is CONNECTION-LOCAL and cannot be enabled inside
    // a transaction; WAL increases reliability for concurrent readers.
    await db.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    const version = await db.getFirstAsync<{ user_version: number }>(
      'PRAGMA user_version',
    );
    if (!version || !Number.isInteger(version.user_version)) {
      throw new Error('Unable to read M3 SQLite schema version.');
    }
    if (version.user_version > LOCAL_WORKOUT_SCHEMA_VERSION) {
      throw new Error(
        'M3 SQLite schema is newer than this app. Update KeylorForge.',
      );
    }
    if (version.user_version < 0) {
      throw new Error('M3 SQLite schema version is invalid.');
    }
    if (version.user_version === 0) {
      // The v1 DDL is idempotent. PRAGMA user_version is set *only after*
      // initialization succeeds; an interrupted first launch can retry safely.
      await initializeLocalWorkoutSchema(db as SqliteWorkoutPort);
      await db.execAsync(
        `PRAGMA user_version = ${LOCAL_WORKOUT_SCHEMA_VERSION};`,
      );
    }
    // The SDK's SQLiteDatabase implements the three query methods and the
    // scoped withExclusiveTransactionAsync callback of SqliteWorkoutPort.
    return db as SqliteWorkoutPort;
  } catch (error) {
    await db.closeAsync();
    throw error;
  }
}

/** Open once per JS process; failed initializations can be retried. */
export function openLocalWorkoutDatabase(): Promise<SqliteWorkoutPort> {
  if (!opened) {
    opened = initializeNativeWorkoutDatabase().catch((error: unknown) => {
      opened = null;
      throw error;
    });
  }
  return opened;
}
