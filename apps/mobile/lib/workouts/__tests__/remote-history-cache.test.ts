import {
  cacheRemoteOnlyWorkout,
  readCachedRemoteOnlyWorkout,
} from '../remote-history-cache';
import { fetchRemoteOnlyWorkoutCandidate } from '../remote-history-preview';
import type { SqliteQueryPort, SqliteWorkoutPort } from '../local-schema';
import type { StartSyncAccess } from '../start-session-sync';

jest.mock('../remote-history-preview', () => ({
  ...jest.requireActual('../remote-history-preview'),
  fetchRemoteOnlyWorkoutCandidate: jest.fn(),
}));

const OWNER = 'a3dbf764-e0e3-41aa-9895-6e58eadfbb14';
const OTHER = 'e426dd13-344a-4b69-8920-cb014715c6c1';
const SESSION = '1f2d27bc-4904-4f4f-9367-39565d78f211';
const SNAPSHOT = '17e1a62d-965f-4caf-a509-c95ab2fe6438';
const FINISH = '0d72c629-6248-4221-8ab2-d9b9f1b63901';
const OCCURRENCE = 'c226a777-d460-4d5f-bad6-f75667a9d022';
const SET = '1b428bd6-781d-44ec-8609-57af594a5511';
const EXERCISE = '502c4c87-80a5-4567-9aaf-296e43bfc4d1';

const detail = {
  session_id: SESSION,
  lifecycle_state: 'completed',
  started_at: '2026-10-09T14:00:00+00:00',
  finished_at: '2026-10-09T15:00:00+00:00',
  completion_snapshot_id: SNAPSHOT,
  finish_mutation_id: '0d72c629-6248-4221-8ab2-d9b9f1b63901',
  completion_snapshot: {
    session_id: SESSION,
    completion_snapshot_id: SNAPSHOT,
    unplanned_performed_occurrences: [
      {
        occurrence_id: OCCURRENCE,
        canonical_exercise_id: EXERCISE,
        actual_order: 0,
        set_ids: [SET],
      },
    ],
  },
  occurrences: [
    {
      occurrence_id: OCCURRENCE,
      canonical_exercise_id: EXERCISE,
      actual_order: 0,
      first_set_id: SET,
      sets: [
        {
          set_id: SET,
          mutation_id: 'c4b03454-a640-4b84-a525-6bf05f068b9e',
          occurrence_id: OCCURRENCE,
          set_role: 'WORKING',
          measurement_type: 'reps',
          reps: 8,
          duration_seconds: null,
          distance_decimal: null,
          distance_unit: null,
          load_decimal: '27.500',
          load_unit: 'lb',
          load_entry_semantics: 'machine_display',
          machine_profile_id: null,
          machine_configuration_id: null,
          completed_at: '2026-10-09T14:30:00+00:00',
        },
      ],
    },
  ],
};

const preview = {
  sessionId: SESSION,
  finishedAt: '2026-10-09T15:00:00+00:00',
  occurrenceCount: 1,
  confirmedSets: 1,
  workingSets: 1,
};

function candidate() {
  return {
    status: 'candidate' as const,
    preview,
    detailJson: JSON.stringify(detail),
    completionSnapshotId: SNAPSHOT,
    finishMutationId: FINISH,
  };
}

type Row = {
  subject: string;
  session_id: string;
  completion_snapshot_id: string;
  finish_mutation_id: string;
  origin: string;
  finished_at_utc: string;
  observed_at_utc: string;
  occurrence_count: number;
  total_sets: number;
  working_sets: number;
  detail_json: string;
};

class FakeDb implements SqliteWorkoutPort {
  rows = new Map<string, Row>();
  localSession = false;
  existingOutbox = false;
  failWrite = false;
  onWrite?: () => void;
  writes = 0;

  async execAsync(): Promise<void> {
    throw new Error('no DDL in write test');
  }

  async getFirstAsync<T>(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<T | null> {
    const [owner, id] = params;
    let value: unknown = null;
    if (sql.includes('FROM local_workout_sessions')) {
      value = this.localSession ? { session_id: id } : null;
    } else if (sql.includes('FROM local_workout_outbox')) {
      value = this.existingOutbox ? { mutation_id: FINISH } : null;
    } else if (sql.includes('FROM local_remote_workout_history')) {
      value = this.rows.get(String(owner) + '/' + String(id)) ?? null;
    } else {
      throw new Error('Unexpected SQL query ' + sql);
    }
    return (value ?? null) as T | null;
  }

  async runAsync(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<unknown> {
    if (!sql.startsWith('INSERT INTO local_remote_workout_history')) {
      throw new Error('Non-readmodel write forbidden');
    }
    if (this.failWrite) throw new Error('SQLite busy');
    this.writes += 1;
    const [
      owner,
      id,
      snapshot,
      finish,
      finished,
      observed,
      occurrenceCount,
      totalSets,
      workingSets,
      detail,
    ] = params;
    this.rows.set(String(owner) + '/' + String(id), {
      subject: String(owner),
      session_id: String(id),
      completion_snapshot_id: String(snapshot),
      finish_mutation_id: String(finish),
      origin: 'remote_complete',
      finished_at_utc: String(finished),
      observed_at_utc: String(observed),
      occurrence_count: Number(occurrenceCount),
      total_sets: Number(totalSets),
      working_sets: Number(workingSets),
      detail_json: String(detail),
    });
    this.onWrite?.();
    return undefined;
  }

  async withExclusiveTransactionAsync(
    task: (tx: SqliteQueryPort) => Promise<void>,
  ): Promise<void> {
    const backup = new Map(this.rows);
    const writes = this.writes;
    try {
      await task(this);
    } catch (error) {
      this.rows = backup;
      this.writes = writes;
      throw error;
    }
  }
}

function identity() {
  let owner: string | null = OWNER;
  return {
    access: {
      currentAuthenticatedSubject: () => owner,
      acquireCurrentCredentials: async () => null,
    } satisfies StartSyncAccess,
    switchTo: (next: string | null) => {
      owner = next;
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(fetchRemoteOnlyWorkoutCandidate).mockResolvedValue(candidate());
});

describe('remote-only workout immutable local read model', () => {
  it('stores server-only history without local START, SET, FINISH or synthetic outbox ACK', async () => {
    const db = new FakeDb();
    const { access } = identity();
    expect(await cacheRemoteOnlyWorkout(db, access, SESSION)).toEqual({
      status: 'stored',
      preview,
    });
    expect(db.writes).toBe(1);
    expect(db.rows.size).toBe(1);
    expect(await readCachedRemoteOnlyWorkout(db, access, SESSION)).toEqual({
      preview,
      detailJson: candidate().detailJson,
    });
    expect(await cacheRemoteOnlyWorkout(db, access, SESSION)).toEqual({
      status: 'alreadyStored',
      preview,
    });
    expect(db.writes).toBe(1);
  });

  it('never caches over local active, completed or cancelled session IDs or pending mutations', async () => {
    const db = new FakeDb();
    db.localSession = true;
    expect(
      await cacheRemoteOnlyWorkout(db, identity().access, SESSION),
    ).toEqual({
      status: 'paused',
      reason: 'localCollision',
    });
    db.localSession = false;
    db.existingOutbox = true;
    expect(
      await cacheRemoteOnlyWorkout(db, identity().access, SESSION),
    ).toEqual({
      status: 'paused',
      reason: 'localCollision',
    });
    expect(db.rows.size).toBe(0);
    expect(db.writes).toBe(0);
  });

  it('does not overwrite remote-only data with a different server response', async () => {
    const db = new FakeDb();
    await cacheRemoteOnlyWorkout(db, identity().access, SESSION);
    jest.mocked(fetchRemoteOnlyWorkoutCandidate).mockResolvedValueOnce({
      ...candidate(),
      detailJson: JSON.stringify({ ...detail, time_zone: 'Europe/Madrid' }),
    });
    expect(
      await cacheRemoteOnlyWorkout(db, identity().access, SESSION),
    ).toEqual({
      status: 'paused',
      reason: 'remoteConflict',
    });
    expect(db.writes).toBe(1);
  });

  it('preserves existing SQLite state when remote validation is incomplete or offline', async () => {
    const db = new FakeDb();
    jest.mocked(fetchRemoteOnlyWorkoutCandidate).mockResolvedValueOnce({
      status: 'paused',
      reason: 'incompleteAudit',
    });
    expect(
      await cacheRemoteOnlyWorkout(db, identity().access, SESSION),
    ).toEqual({
      status: 'paused',
      reason: 'incompleteAudit',
    });
    expect(db.writes).toBe(0);
  });

  it('rolls back after a failed SQLite write or account switch mid-transaction', async () => {
    const db = new FakeDb();
    db.failWrite = true;
    await expect(
      cacheRemoteOnlyWorkout(db, identity().access, SESSION),
    ).rejects.toThrow('SQLite busy');
    expect(db.rows.size).toBe(0);
    db.failWrite = false;
    const owner = identity();
    db.onWrite = () => owner.switchTo(OTHER);
    await expect(
      cacheRemoteOnlyWorkout(db, owner.access, SESSION),
    ).rejects.toThrow('notAuthenticated');
    expect(db.rows.size).toBe(0);
    expect(db.writes).toBe(0);
  });

  it('rejects inconsistent candidate metadata and malformed native details without SQLite writes', async () => {
    const db = new FakeDb();
    const good = candidate();
    const invalid = [
      { ...good, preview: { ...preview, workingSets: 2 } },
      { ...good, completionSnapshotId: OTHER },
      { ...good, finishMutationId: OTHER },
      { ...good, detailJson: '{invalid-json' },
      {
        ...good,
        detailJson: JSON.stringify({ ...detail, lifecycle_state: 'cancelled' }),
      },
      {
        ...good,
        detailJson: JSON.stringify({
          ...detail,
          occurrences: [{ ...detail.occurrences[0], sets: [] }],
        }),
      },
      { ...good, preview: { ...preview, sessionId: OTHER } },
    ];
    for (const invalidCandidate of invalid) {
      jest
        .mocked(fetchRemoteOnlyWorkoutCandidate)
        .mockResolvedValueOnce(invalidCandidate);
      expect(
        await cacheRemoteOnlyWorkout(db, identity().access, SESSION),
      ).toEqual({
        status: 'paused',
        reason: 'invalidResponse',
      });
    }
    expect(db.writes).toBe(0);
    expect(db.rows.size).toBe(0);
  });

  it('keeps the native measurement payload intact without creating local mutations', async () => {
    const db = new FakeDb();
    const { access } = identity();
    const payload = {
      ...detail,
      occurrences: [
        {
          ...detail.occurrences[0],
          sets: [
            {
              ...detail.occurrences[0]!.sets[0],
              machine_snapshot: { equipment: 'cable', calibration: 'original' },
              target_at_confirmation: { kind: 'reps', goal: 8 },
            },
          ],
        },
      ],
    };
    const detailJson = JSON.stringify(payload);
    jest.mocked(fetchRemoteOnlyWorkoutCandidate).mockResolvedValueOnce({
      ...candidate(),
      detailJson,
    });
    expect(await cacheRemoteOnlyWorkout(db, access, SESSION)).toEqual({
      status: 'stored',
      preview,
    });
    expect(
      (await readCachedRemoteOnlyWorkout(db, access, SESSION))?.detailJson,
    ).toBe(detailJson);
    expect(db.writes).toBe(1);
  });

  it('fences cached detail reads after account switching and logout', async () => {
    const db = new FakeDb();
    const owner = identity();
    await cacheRemoteOnlyWorkout(db, owner.access, SESSION);
    owner.switchTo(OTHER);
    expect(
      await readCachedRemoteOnlyWorkout(db, owner.access, SESSION),
    ).toBeNull();
    owner.switchTo(null);
    await expect(
      readCachedRemoteOnlyWorkout(db, owner.access, SESSION),
    ).rejects.toThrow('notAuthenticated');
  });
});
