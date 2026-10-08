import * as SQLite from 'expo-sqlite';

import { openLocalWorkoutDatabase } from '../expo-sqlite-adapter';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

describe('M3 Expo SQLite native database binding', () => {
  it('initializes the persisted v1 schema exactly once and retains its connection', async () => {
    const queries: string[] = [];
    const database = {
      execAsync: jest.fn(async (sql: string) => {
        queries.push(sql);
      }),
      getFirstAsync: jest.fn(async () => ({ user_version: 0 })),
      runAsync: jest.fn(),
      withExclusiveTransactionAsync: jest.fn(),
      closeAsync: jest.fn(),
    };
    jest.mocked(SQLite.openDatabaseAsync).mockResolvedValue(
      database as unknown as SQLite.SQLiteDatabase,
    );

    const first = await openLocalWorkoutDatabase();
    const second = await openLocalWorkoutDatabase();

    expect(second).toBe(first);
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledWith(
      'keylorforge-m3-workouts.db',
    );
    expect(queries[0]).toContain('PRAGMA foreign_keys = ON;');
    expect(queries.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS local_workout_sessions'))).toBe(true);
    expect(queries[queries.length - 1]).toBe('PRAGMA user_version = 1;');
    expect(database.closeAsync).not.toHaveBeenCalled();
  });
});
