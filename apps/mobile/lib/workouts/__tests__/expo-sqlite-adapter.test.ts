import * as SQLite from 'expo-sqlite';

import { openLocalWorkoutDatabase } from '../expo-sqlite-adapter';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

describe('M3 Expo SQLite native database binding', () => {
  it('initializes and migrates the persisted v6 schema exactly once and retains its connection', async () => {
    const queries: string[] = [];
    const database = {
      execAsync: jest.fn(async (sql: string) => {
        queries.push(sql);
      }),
      getFirstAsync: jest.fn(async (sql: string) =>
        sql === 'PRAGMA user_version' ? { user_version: 0 } : null,
      ),
      runAsync: jest.fn(),
      withExclusiveTransactionAsync: jest.fn(),
      closeAsync: jest.fn(),
    };
    jest
      .mocked(SQLite.openDatabaseAsync)
      .mockResolvedValue(database as unknown as SQLite.SQLiteDatabase);

    const first = await openLocalWorkoutDatabase();
    const second = await openLocalWorkoutDatabase();

    expect(second).toBe(first);
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledWith(
      'keylorforge-m3-workouts.db',
    );
    expect(queries[0]).toContain('PRAGMA foreign_keys = ON;');
    expect(
      queries.some((sql) =>
        sql.includes('CREATE TABLE IF NOT EXISTS local_workout_sessions'),
      ),
    ).toBe(true);
    expect(queries).toContain('PRAGMA user_version = 1;');
    expect(
      queries.some((sql) => sql.includes('CREATE TABLE local_workout_sets')),
    ).toBe(true);
    expect(queries).toContain('PRAGMA user_version = 2; COMMIT;');
    expect(
      queries.some((sql) =>
        sql.includes('CREATE TABLE local_machine_profiles'),
      ),
    ).toBe(true);
    expect(
      queries.some((sql) => sql.includes('CREATE TABLE local_machine_outbox')),
    ).toBe(true);
    expect(
      queries.some((sql) =>
        sql.includes('CREATE TABLE local_workout_final_snapshots'),
      ),
    ).toBe(true);
    expect(queries.some((sql) => sql.includes('FINISH_SESSION'))).toBe(true);
    expect(queries[queries.length - 1]).toBe('PRAGMA foreign_keys = ON;');
    expect(queries).toContain('PRAGMA user_version = 4; COMMIT;');
    expect(queries).toContain('PRAGMA user_version = 5; COMMIT;');
    expect(queries).toContain('PRAGMA user_version = 6; COMMIT;');
    expect(queries.some((sql) => sql.includes('CREATE TABLE local_remote_workout_history'))).toBe(true);
    expect(
      queries.some((sql) =>
        sql.includes('CREATE TABLE local_workout_cancellations'),
      ),
    ).toBe(true);
    expect(queries.some((sql) => sql.includes('CANCEL_SESSION'))).toBe(true);
    expect(database.closeAsync).not.toHaveBeenCalled();
  });
});
