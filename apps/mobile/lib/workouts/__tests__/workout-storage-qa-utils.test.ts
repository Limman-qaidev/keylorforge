import {
  resetDiagnosticSubjectData,
  verifyPersistedDiagnosticMachine,
} from '../workout-storage-qa-utils';
import type { LocalPerformedSet } from '../local-confirmed-sets';
import type { SqliteQueryPort, SqliteWorkoutPort } from '../local-schema';
import type { LocalSubjectAccess } from '../local-store';

const A = 'a3dbf764-e0e3-41aa-9895-6e58eadfbb14';
const B = 'e426dd13-344a-4b69-8920-cb014715c6c1';
const PROFILE_A = '2d2bd42f-bebf-45d3-81b1-a89b8830872b';

type Mutation = {
  subject: string;
  mutationId: string;
  parent: string | null;
};

class FakeQaDatabase implements SqliteWorkoutPort {
  readonly sets = new Set<string>([A, B]);
  readonly occurrences = new Set<string>([A, B]);
  readonly sessions = new Set<string>([A, B]);
  readonly mutations: Mutation[] = [
    { subject: A, mutationId: 'start', parent: null },
    { subject: A, mutationId: 'first', parent: 'start' },
    { subject: A, mutationId: 'second', parent: 'first' },
    { subject: B, mutationId: 'other-account-start', parent: null },
  ];
  readonly deleteOrder: string[] = [];
  afterFirstLeaf: (() => void) | undefined;

  async execAsync(): Promise<void> {}

  async withExclusiveTransactionAsync(
    callback: (tx: SqliteQueryPort) => Promise<void>,
  ): Promise<void> {
    const sets = new Set(this.sets);
    const occurrences = new Set(this.occurrences);
    const sessions = new Set(this.sessions);
    const mutations = this.mutations.map((row) => ({ ...row }));
    const orderLength = this.deleteOrder.length;
    try {
      await callback(this);
    } catch (error) {
      this.sets.clear();
      this.occurrences.clear();
      this.sessions.clear();
      sets.forEach((subject) => this.sets.add(subject));
      occurrences.forEach((subject) => this.occurrences.add(subject));
      sessions.forEach((subject) => this.sessions.add(subject));
      this.mutations.splice(0, this.mutations.length, ...mutations);
      this.deleteOrder.length = orderLength;
      throw error;
    }
  }

  async getFirstAsync<T>(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<T | null> {
    const subject = params[0];
    if (sql.includes('SELECT parent.mutation_id')) {
      const leaf = this.mutations.find(
        (candidate) =>
          candidate.subject === subject &&
          !this.mutations.some(
            (child) =>
              child.subject === subject &&
              child.parent === candidate.mutationId,
          ),
      );
      this.afterFirstLeaf?.();
      return (leaf ? { mutation_id: leaf.mutationId } : null) as T | null;
    }
    if (sql.includes('SELECT COUNT(*) AS total')) {
      return {
        total: this.mutations.filter((row) => row.subject === subject).length,
      } as T;
    }
    throw new Error('Unexpected SELECT: ' + sql);
  }

  async runAsync(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<unknown> {
    const subject = params[0];
    if (sql.startsWith('DELETE FROM local_workout_sets')) {
      this.sets.delete(String(subject));
      return;
    }
    if (sql.startsWith('DELETE FROM local_workout_occurrences')) {
      if (this.sets.has(String(subject))) {
        throw new Error('FOREIGN KEY: set references occurrence');
      }
      this.occurrences.delete(String(subject));
      return;
    }
    if (sql.startsWith('DELETE FROM local_workout_outbox')) {
      const mutationId = String(params[1]);
      if (
        this.mutations.some(
          (row) => row.subject === subject && row.parent === mutationId,
        )
      ) {
        throw new Error('FOREIGN KEY: child references parent');
      }
      const index = this.mutations.findIndex(
        (row) => row.subject === subject && row.mutationId === mutationId,
      );
      if (index < 0) {
        throw new Error('Missing mutation');
      }
      this.mutations.splice(index, 1);
      this.deleteOrder.push(mutationId);
      return;
    }
    if (sql.startsWith('DELETE FROM local_workout_sessions')) {
      if (
        this.occurrences.has(String(subject)) ||
        this.mutations.some((row) => row.subject === subject)
      ) {
        throw new Error('FOREIGN KEY: session has children');
      }
      this.sessions.delete(String(subject));
      return;
    }
    throw new Error('Unexpected DELETE: ' + sql);
  }
}

function account(initial: string | null = A): {
  access: LocalSubjectAccess;
  change: (value: string | null) => void;
} {
  let subject = initial;
  return {
    access: { currentAuthenticatedSubject: () => subject },
    change: (value) => {
      subject = value;
    },
  };
}

describe('M3 isolated physical-device QA', () => {
  it('deletes outbox leaves before parents, preserving another account', async () => {
    const db = new FakeQaDatabase();
    await resetDiagnosticSubjectData(db, account().access, A);
    expect(db.deleteOrder).toEqual(['second', 'first', 'start']);
    expect(db.sets.has(A)).toBe(false);
    expect(db.occurrences.has(A)).toBe(false);
    expect(db.sessions.has(A)).toBe(false);
    expect(db.sessions.has(B)).toBe(true);
    expect(db.sets.has(B)).toBe(true);
    expect(db.mutations).toEqual([
      { subject: B, mutationId: 'other-account-start', parent: null },
    ]);
  });

  it('rolls back the whole reset if the subject changes mid-transaction', async () => {
    const db = new FakeQaDatabase();
    const auth = account();
    db.afterFirstLeaf = () => auth.change(B);
    await expect(
      resetDiagnosticSubjectData(db, auth.access, A),
    ).rejects.toThrow('La cuenta ha cambiado.');
    expect(db.mutations).toHaveLength(4);
    expect(db.sessions.has(A)).toBe(true);
    expect(db.sets.has(A)).toBe(true);
  });

  it('fails closed on a cyclic dependency instead of claiming a reset', async () => {
    const db = new FakeQaDatabase();
    db.mutations.splice(
      0,
      3,
      { subject: A, mutationId: 'one', parent: 'two' },
      { subject: A, mutationId: 'two', parent: 'one' },
    );
    await expect(
      resetDiagnosticSubjectData(db, account().access, A),
    ).rejects.toThrow('Dependencias circulares');
    expect(db.mutations.filter((row) => row.subject === A)).toHaveLength(2);
    expect(db.sessions.has(A)).toBe(true);
  });

  it('validates machine label and ID read from SQLite, not predetermined UI text', () => {
    const saved: Pick<
      LocalPerformedSet,
      'machine_profile_id' | 'machine_snapshot_json'
    > = {
      machine_profile_id: PROFILE_A,
      machine_snapshot_json: '{"label":"Polea A (QA)"}',
    };
    expect(
      verifyPersistedDiagnosticMachine(saved, PROFILE_A, 'Polea A (QA)'),
    ).toEqual({
      profileId: PROFILE_A,
      label: 'Polea A (QA)',
      matchesExpected: true,
    });
    expect(
      verifyPersistedDiagnosticMachine(
        { ...saved, machine_profile_id: B },
        PROFILE_A,
        'Polea A (QA)',
      ).matchesExpected,
    ).toBe(false);
    expect(
      verifyPersistedDiagnosticMachine(
        { ...saved, machine_snapshot_json: '{"label":"Polea C"}' },
        PROFILE_A,
        'Polea A (QA)',
      ),
    ).toMatchObject({ label: 'Polea C', matchesExpected: false });
  });

  it.each([null, '', '{bad json', '{"label":55}', '{}'])(
    'explicitly rejects missing or malformed persisted machine JSON: %j',
    (machine_snapshot_json) => {
      const actual = verifyPersistedDiagnosticMachine(
        { machine_profile_id: PROFILE_A, machine_snapshot_json },
        PROFILE_A,
        'Polea A (QA)',
      );
      expect(actual.matchesExpected).toBe(false);
      expect(actual.label).toBe('(snapshot ausente o inválido)');
    },
  );
});
