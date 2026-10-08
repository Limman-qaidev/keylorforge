import {
  confirmLocalWorkoutSet,
  readLocalConfirmedSet,
  type ConfirmLocalSetInput,
  type LocalPerformedSet,
} from '../local-confirmed-sets';
import type { SqliteQueryPort, SqliteWorkoutPort } from '../local-schema';
import type { LocalSubjectAccess, LocalWorkoutSession } from '../local-store';

const A = 'a3dbf764-e0e3-41aa-9895-6e58eadfbb14';
const B = 'e426dd13-344a-4b69-8920-cb014715c6c1';
const SESSION = '1f2d27bc-4904-4f4f-9367-39565d78f211';
const FIRST_MUTATION = 'bf6ba981-334f-4d88-b081-c74d65b940fa';

const first: ConfirmLocalSetInput = {
  sessionId: SESSION,
  mutationId: '0d72c629-6248-4221-8ab2-d9b9f1b63901',
  setId: '1b428bd6-781d-44ec-8609-57af594a5511',
  occurrenceId: 'c226a777-d460-4d5f-bad6-f75667a9d022',
  canonicalExerciseId: '502c4c87-80a5-4567-9aaf-296e43bfc4d1',
  agendaItemId: null,
  actualOrder: 0,
  firstSet: true,
  setRole: 'WARMUP',
  measurement: { measurementType: 'reps', reps: 12 },
  load: { decimal: '20.5', unit: 'kg', entrySemantics: 'machine_display' },
  machine: {
    profileId: '2d2bd42f-bebf-45d3-81b1-a89b8830872b',
    configurationId: null,
    snapshot: { label: 'Polea A', ratio: 'unknown' },
  },
  targetAtConfirmation: null,
  completedAtUtc: '2026-10-08T14:40:00.000Z',
};

type Outbox = {
  subject: string;
  mutation_id: string;
  session_id: string;
  mutation_kind: string;
  payload_json: string;
  depends_on_mutation_id: string | null;
};

type Occurrence = {
  subject: string;
  session_id: string;
  occurrence_id: string;
  canonical_exercise_id: string;
  actual_order: number;
  first_set_id: string;
};

class FakePerformedSQLite implements SqliteWorkoutPort {
  readonly sessions = new Map<string, LocalWorkoutSession>();
  readonly outbox = new Map<string, Outbox>();
  readonly occurrences = new Map<string, Occurrence>();
  readonly sets = new Map<string, LocalPerformedSet>();
  failSetInsert = false;
  afterSetLookup: (() => void) | undefined;
  duringSessionLookup: (() => void) | undefined;

  constructor() {
    this.sessions.set(A + ':' + SESSION, {
      subject: A,
      session_id: SESSION,
      lifecycle_state: 'active',
      origin: 'free',
      started_at_utc: '2026-10-08T14:30:00.000Z',
      time_zone: 'Europe/Madrid',
      utc_offset_minutes: 120,
      local_date: '2026-10-08',
      original_agenda_json: '{"items":[]}',
      agenda_revision: 0,
    });
    this.outbox.set(A + ':' + FIRST_MUTATION, {
      subject: A,
      mutation_id: FIRST_MUTATION,
      session_id: SESSION,
      mutation_kind: 'START_SESSION',
      payload_json: '{"kind":"start"}',
      depends_on_mutation_id: null,
    });
  }

  async execAsync(): Promise<void> {}

  async withExclusiveTransactionAsync(
    callback: (tx: SqliteQueryPort) => Promise<void>,
  ): Promise<void> {
    const snapshots = [
      [this.sessions, new Map(this.sessions)],
      [this.outbox, new Map(this.outbox)],
      [this.occurrences, new Map(this.occurrences)],
      [this.sets, new Map(this.sets)],
    ] as const;
    try {
      await callback(this);
    } catch (error) {
      for (const [actual, saved] of snapshots) {
        // The four Maps hold different value types, but the rollback
        // preserves each one's own original entries.
        actual.clear();
        for (const [key, value] of saved) {
          (actual as Map<string, unknown>).set(key, value);
        }
      }
      throw error;
    }
  }

  async getFirstAsync<T>(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<T | null> {
    const subject = String(params[0]);
    let result: unknown = null;
    if (sql.includes('FROM local_workout_outbox')) {
      if (sql.includes('ORDER BY rowid DESC')) {
        result = [...this.outbox.values()]
          .reverse()
          .find((r) => r.subject === subject && r.session_id === params[1]);
      } else {
        result = this.outbox.get(subject + ':' + String(params[1]));
      }
    } else if (sql.includes('FROM local_workout_sessions')) {
      result = this.sessions.get(subject + ':' + String(params[1]));
      this.duringSessionLookup?.();
    } else if (sql.includes('FROM local_workout_occurrences')) {
      result = this.occurrences.get(
        subject + ':' + String(params[1]) + ':' + String(params[2]),
      );
    } else if (sql.includes('FROM local_workout_sets')) {
      result = this.sets.get(subject + ':' + String(params[1]));
      if (sql.includes('AND mutation_id = ?')) {
        if (
          (result as LocalPerformedSet | undefined)?.mutation_id !== params[2]
        ) {
          result = null;
        }
        this.afterSetLookup?.();
      }
    } else {
      throw new Error('Unexpected SQLite query: ' + sql);
    }
    return (result ?? null) as T | null;
  }

  async runAsync(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<unknown> {
    if (sql.includes('INSERT INTO local_workout_occurrences')) {
      const [subject, sessionId, id, exercise, , order, firstSet] = params;
      this.occurrences.set(
        String(subject) + ':' + String(sessionId) + ':' + String(id),
        {
          subject: String(subject),
          session_id: String(sessionId),
          occurrence_id: String(id),
          canonical_exercise_id: String(exercise),
          actual_order: Number(order),
          first_set_id: String(firstSet),
        },
      );
    } else if (sql.includes('INSERT INTO local_workout_outbox')) {
      const [subject, mutationId, sessionId, kind, payload, , parent] = params;
      this.outbox.set(String(subject) + ':' + String(mutationId), {
        subject: String(subject),
        mutation_id: String(mutationId),
        session_id: String(sessionId),
        mutation_kind: String(kind),
        payload_json: String(payload),
        depends_on_mutation_id: String(parent),
      });
    } else if (sql.includes('INSERT INTO local_workout_sets')) {
      if (this.failSetInsert) {
        throw new Error('SQLite disk full');
      }
      const [
        subject,
        sessionId,
        setId,
        occurrenceId,
        role,
        measurement,
        reps,
        duration,
        distance,
        distanceUnit,
        load,
        loadUnit,
        semantics,
        machineId,
        machineConfigId,
        machineJson,
        targetJson,
        completed,
        mutationId,
      ] = params;
      const row: LocalPerformedSet = {
        subject: String(subject),
        session_id: String(sessionId),
        set_id: String(setId),
        occurrence_id: String(occurrenceId),
        set_role: String(role) as 'WARMUP' | 'WORKING',
        measurement_type: String(measurement) as 'reps' | 'time' | 'distance',
        reps: reps as number | null,
        duration_seconds: duration as number | null,
        distance_decimal: distance as string | null,
        distance_unit: distanceUnit as string | null,
        load_decimal: load as string | null,
        load_unit: loadUnit as string | null,
        load_entry_semantics: semantics as string | null,
        machine_profile_id: machineId as string | null,
        machine_configuration_id: machineConfigId as string | null,
        machine_snapshot_json: machineJson as string | null,
        target_at_confirmation_json: targetJson as string | null,
        completed_at_utc: String(completed),
        mutation_id: String(mutationId),
      };
      this.sets.set(row.subject + ':' + row.set_id, row);
    } else {
      throw new Error('Unexpected SQLite insert');
    }
    return undefined;
  }
}

function auth(initial: string | null = A) {
  let subject = initial;
  return {
    access: {
      currentAuthenticatedSubject: () => subject,
    } as LocalSubjectAccess,
    change(next: string | null) {
      subject = next;
    },
  };
}

const next: ConfirmLocalSetInput = {
  ...first,
  firstSet: false,
  mutationId: '3306d7ec-eb13-483f-a48c-c6c0bd51a3ad',
  setId: 'c60d379f-5cf5-4ec1-a5d9-9666ce5a0a7d',
  setRole: 'WORKING',
  measurement: { measurementType: 'reps', reps: 8 },
  machine: {
    profileId: 'c7fcaa34-6341-44cd-b01a-79a60bd526aa',
    configurationId: null,
    snapshot: { label: 'Polea B', ratio: 'unknown' },
  },
  load: { decimal: '27.5', unit: 'lb', entrySemantics: 'machine_display' },
  completedAtUtc: '2026-10-08T14:43:00.000Z',
};

describe('M3 actual confirmed workout history', () => {
  it('atomically commits a first WARMUP occurrence+set+causally ordered outbox', async () => {
    const db = new FakePerformedSQLite();
    const row = await confirmLocalWorkoutSet(db, auth().access, first);
    expect(row.set_role).toBe('WARMUP');
    expect(row.load_decimal).toBe('20.5');
    expect(row.load_unit).toBe('kg');
    expect(db.occurrences.size).toBe(1);
    expect(db.sets.size).toBe(1);
    expect(db.outbox.size).toBe(2);
    expect(db.outbox.get(A + ':' + first.mutationId)).toMatchObject({
      mutation_kind: 'CONFIRM_FIRST_SET_WITH_OCCURRENCE',
      depends_on_mutation_id: FIRST_MUTATION,
    });
    expect(await readLocalConfirmedSet(db, auth().access, first.setId)).toEqual(
      row,
    );
  });

  it('appends WORKING sets to the same occurrence with original machine/unit per set', async () => {
    const db = new FakePerformedSQLite();
    const access = auth().access;
    await confirmLocalWorkoutSet(db, access, first);
    const row = await confirmLocalWorkoutSet(db, access, next);
    expect(db.occurrences.size).toBe(1);
    expect(db.sets.size).toBe(2);
    expect(row.set_role).toBe('WORKING');
    expect(row.load_unit).toBe('lb');
    expect(row.machine_profile_id).toBe(next.machine?.profileId);
    expect(
      db.outbox.get(A + ':' + next.mutationId)?.depends_on_mutation_id,
    ).toBe(first.mutationId);
  });

  it('replaying the same first set with uppercase UUIDs is idempotent', async () => {
    const db = new FakePerformedSQLite();
    const access = auth().access;
    const initial = await confirmLocalWorkoutSet(db, access, first);
    const replay = await confirmLocalWorkoutSet(db, access, {
      ...first,
      setId: first.setId.toUpperCase(),
      mutationId: first.mutationId.toUpperCase(),
      occurrenceId: first.occurrenceId.toUpperCase(),
      canonicalExerciseId: first.canonicalExerciseId.toUpperCase(),
    });
    expect(replay).toEqual(initial);
    expect(db.sets.size).toBe(1);
    expect(db.outbox.size).toBe(2);
  });

  it('rejects mutation ID reuse with changed performed work', async () => {
    const db = new FakePerformedSQLite();
    const access = auth().access;
    await confirmLocalWorkoutSet(db, access, first);
    await expect(
      confirmLocalWorkoutSet(db, access, {
        ...first,
        measurement: { measurementType: 'reps', reps: 13 },
      }),
    ).rejects.toMatchObject({ code: 'mutationConflict' });
  });

  it('freezes nested form and machine snapshots before SQLite awaits', async () => {
    const db = new FakePerformedSQLite();
    const mutable = JSON.parse(JSON.stringify(first)) as ConfirmLocalSetInput;
    db.duringSessionLookup = () => {
      if (mutable.measurement.measurementType === 'reps') {
        mutable.measurement.reps = 99;
      }
      if (mutable.load) {
        mutable.load.decimal = '999';
      }
      if (mutable.machine) {
        mutable.machine.snapshot.label = 'mutated after START';
      }
    };
    const result = await confirmLocalWorkoutSet(db, auth().access, mutable);
    expect(result.reps).toBe(12);
    expect(result.load_decimal).toBe('20.5');
    expect(JSON.parse(result.machine_snapshot_json!)).toEqual({
      label: 'Polea A',
      ratio: 'unknown',
    });
    const payload = JSON.parse(
      db.outbox.get(A + ':' + first.mutationId)!.payload_json,
    );
    expect(payload.measurement.reps).toBe(12);
    expect(payload.load.decimal).toBe('20.5');
    expect(payload.machine.snapshot.label).toBe('Polea A');
  });

  it('rolls back occurrence and outbox when the set insert fails', async () => {
    const db = new FakePerformedSQLite();
    db.failSetInsert = true;
    await expect(
      confirmLocalWorkoutSet(db, auth().access, first),
    ).rejects.toThrow('SQLite disk full');
    expect(db.occurrences.size).toBe(0);
    expect(db.sets.size).toBe(0);
    expect(db.outbox.size).toBe(1);
  });

  it('rejects an additional set without an existing performed occurrence', async () => {
    const db = new FakePerformedSQLite();
    await expect(
      confirmLocalWorkoutSet(db, auth().access, next),
    ).rejects.toMatchObject({
      code: 'occurrenceMissing',
    });
    expect(db.outbox.size).toBe(1);
  });

  it('refuses confirmed work for a session owned by another account', async () => {
    const db = new FakePerformedSQLite();
    await expect(
      confirmLocalWorkoutSet(db, auth(B).access, first),
    ).rejects.toMatchObject({
      code: 'sessionNotActive',
    });
    expect(
      await readLocalConfirmedSet(db, auth(B).access, first.setId),
    ).toBeNull();
  });

  it.each([
    { measurement: { measurementType: 'reps', reps: -2 } },
    { measurement: { measurementType: 'reps', reps: 1.5 } },
    {
      measurement: {
        measurementType: 'distance',
        distanceDecimal: '3e8',
        distanceUnit: 'km',
      },
    },
    { load: { decimal: '-10', unit: 'kg', entrySemantics: 'assistance' } },
    { completedAtUtc: 'not-a-date' },
  ])(
    'rejects invalid performed measurements before writing: %j',
    async (changes) => {
      const db = new FakePerformedSQLite();
      await expect(
        confirmLocalWorkoutSet(db, auth().access, {
          ...first,
          ...changes,
        } as ConfirmLocalSetInput),
      ).rejects.toMatchObject({ code: 'invalidInput' });
      expect(db.outbox.size).toBe(1);
      expect(db.occurrences.size).toBe(0);
    },
  );

  it('fences logout or account switch in the final database await and rolls back', async () => {
    const db = new FakePerformedSQLite();
    const account = auth();
    db.afterSetLookup = () => account.change(B);
    await expect(
      confirmLocalWorkoutSet(db, account.access, first),
    ).rejects.toMatchObject({
      code: 'notAuthenticated',
    });
    expect(db.occurrences.size).toBe(0);
    expect(db.sets.size).toBe(0);
    expect(db.outbox.size).toBe(1);
  });
});
