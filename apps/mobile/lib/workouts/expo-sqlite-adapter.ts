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
  migrateWorkoutSchemaV1ToV2,
  LOCAL_WORKOUT_PERFORMED_SCHEMA_VERSION,
} from './local-performed-schema';
import {
  migrateWorkoutSchemaV2ToV3,
  LOCAL_WORKOUT_MACHINE_SCHEMA_VERSION,
} from './local-machine-schema';
import {
  migrateWorkoutSchemaV3ToV4,
  LOCAL_WORKOUT_FINISH_SCHEMA_VERSION,
} from './local-finish-schema';
import {
  migrateWorkoutSchemaV4ToV5,
  LOCAL_WORKOUT_CANCEL_SCHEMA_VERSION,
} from './local-cancel-schema';
import {
  initializeLocalWorkoutSchema,
  LOCAL_WORKOUT_SCHEMA_VERSION,
  type SqliteWorkoutPort,
} from './local-schema';

const DATABASE_NAME = 'keylorforge-m3-workouts.db';
let opened: Promise<SqliteWorkoutPort> | null = null;

async function initializeNativeWorkoutDatabase(
  databaseName: string,
): Promise<SqliteWorkoutPort> {
  if (Platform.OS === 'web') {
    throw new Error(
      'M3 native SQLite workout storage is not supported on web.',
    );
  }
  const db = await SQLite.openDatabaseAsync(databaseName);
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
    if (version.user_version > LOCAL_WORKOUT_CANCEL_SCHEMA_VERSION) {
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
    if (version.user_version <= LOCAL_WORKOUT_SCHEMA_VERSION) {
      await migrateWorkoutSchemaV1ToV2(db as SqliteWorkoutPort);
    }
    if (version.user_version <= LOCAL_WORKOUT_PERFORMED_SCHEMA_VERSION) {
      await migrateWorkoutSchemaV2ToV3(db as SqliteWorkoutPort);
    }
    if (version.user_version <= LOCAL_WORKOUT_MACHINE_SCHEMA_VERSION) {
      await migrateWorkoutSchemaV3ToV4(db as SqliteWorkoutPort);
    }
    if (version.user_version <= LOCAL_WORKOUT_FINISH_SCHEMA_VERSION) {
      await migrateWorkoutSchemaV4ToV5(db as SqliteWorkoutPort);
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
    opened = initializeNativeWorkoutDatabase(DATABASE_NAME).catch(
      (error: unknown) => {
        opened = null;
        throw error;
      },
    );
  }
  return opened;
}

/** Isolated, development-only store for real-device SQLite smoke testing. */
const diagnosticDatabases = new Map<string, Promise<SqliteWorkoutPort>>();
const previewDatabases = new Map<string, Promise<SqliteWorkoutPort>>();

/**
 * Persistent, per-account UI preview database, distinct from BOTH the real
 * workout store and previous developer diagnostics. Never reset user data.
 */
export function openPreviewWorkoutDatabase(
  subject: string,
): Promise<SqliteWorkoutPort> {
  if (!__DEV__) {
    throw new Error('Workout preview is unavailable in release builds.');
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      subject,
    )
  ) {
    throw new Error('A valid authenticated subject is required.');
  }
  const databaseName = `keylorforge-m3-ui-preview-${subject.toLowerCase()}.db`;
  let preview = previewDatabases.get(databaseName);
  if (!preview) {
    preview = initializeNativeWorkoutDatabase(databaseName).catch(
      (error: unknown) => {
        previewDatabases.delete(databaseName);
        throw error;
      },
    );
    previewDatabases.set(databaseName, preview);
  }
  return preview;
}

export function openDiagnosticWorkoutDatabase(
  subject: string,
): Promise<SqliteWorkoutPort> {
  if (!__DEV__) {
    throw new Error(
      'M3 diagnostic storage is not available in release builds.',
    );
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      subject,
    )
  ) {
    throw new Error('A valid authenticated subject is required.');
  }
  const databaseName = `keylorforge-m3-qa-${subject.toLowerCase()}.db`;
  let openedForSubject = diagnosticDatabases.get(databaseName);
  if (!openedForSubject) {
    openedForSubject = initializeNativeWorkoutDatabase(databaseName).catch(
      (error: unknown) => {
        diagnosticDatabases.delete(databaseName);
        throw error;
      },
    );
    diagnosticDatabases.set(databaseName, openedForSubject);
  }
  return openedForSubject;
}
