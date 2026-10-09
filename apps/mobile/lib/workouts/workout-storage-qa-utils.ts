/**
 * Development-only M3 SQLite diagnostic helpers.
 *
 * The caller MUST pass the subject-partitioned diagnostic database returned
 * by openDiagnosticWorkoutDatabase, never the production workout store.
 */
import type { SqliteWorkoutPort } from './local-schema';
import type { LocalPerformedSet } from './local-confirmed-sets';
import type { LocalSubjectAccess } from './local-store';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PersistedMachineVerification = {
  profileId: string;
  label: string;
  matchesExpected: boolean;
};

/** Never infer a machine name from the presence of a set row. */
export function verifyPersistedDiagnosticMachine(
  set: Pick<LocalPerformedSet, 'machine_profile_id' | 'machine_snapshot_json'>,
  expectedProfileId: string,
  expectedLabel: string,
): PersistedMachineVerification {
  let label = '(snapshot ausente o inválido)';
  if (set.machine_snapshot_json !== null) {
    try {
      const snapshot: unknown = JSON.parse(set.machine_snapshot_json);
      if (
        snapshot !== null &&
        typeof snapshot === 'object' &&
        !Array.isArray(snapshot) &&
        'label' in snapshot &&
        typeof snapshot.label === 'string'
      ) {
        label = snapshot.label;
      }
    } catch {
      // Retain an explicit error rather than hiding malformed persisted JSON.
    }
  }
  const profileId = set.machine_profile_id ?? '(perfil ausente)';
  return {
    profileId,
    label,
    matchesExpected:
      profileId === expectedProfileId.toLowerCase() && label === expectedLabel,
  };
}

/**
 * Clear only the authenticated subject's isolated QA database.
 * Outbox rows form a self-referencing ON DELETE RESTRICT graph: delete leaves
 * before their parents, regardless of rowid, timestamp or insertion order.
 * Any missing leaf in a nonempty queue (e.g. a cycle) aborts and rolls back.
 */
export async function resetDiagnosticSubjectData(
  db: SqliteWorkoutPort,
  access: LocalSubjectAccess,
  rawSubject: string,
): Promise<void> {
  if (!UUID.test(rawSubject)) {
    throw new Error('Identidad de diagnóstico inválida.');
  }
  const subject = rawSubject.toLowerCase();
  const checkSubject = () => {
    if (access.currentAuthenticatedSubject()?.toLowerCase() !== subject) {
      throw new Error('La cuenta ha cambiado.');
    }
  };

  checkSubject();
  await db.withExclusiveTransactionAsync(async (tx) => {
    checkSubject();
    // Sets reference occurrences and outbox, so they must be removed first.
    await tx.runAsync(
      'DELETE FROM local_workout_sets WHERE subject = ?',
      subject,
    );
    await tx.runAsync(
      'DELETE FROM local_workout_occurrences WHERE subject = ?',
      subject,
    );

    while (true) {
      checkSubject();
      const leaf = await tx.getFirstAsync<{ mutation_id: string }>(
        `SELECT parent.mutation_id
         FROM local_workout_outbox AS parent
         WHERE parent.subject = ?
           AND NOT EXISTS (
             SELECT 1 FROM local_workout_outbox AS child
             WHERE child.subject = parent.subject
               AND child.depends_on_mutation_id = parent.mutation_id
           )
         LIMIT 1`,
        subject,
      );
      if (!leaf) {
        const remaining = await tx.getFirstAsync<{ total: number }>(
          'SELECT COUNT(*) AS total FROM local_workout_outbox WHERE subject = ?',
          subject,
        );
        if ((remaining?.total ?? 0) !== 0) {
          throw new Error('Dependencias circulares en outbox diagnóstico.');
        }
        break;
      }
      await tx.runAsync(
        'DELETE FROM local_workout_outbox WHERE subject = ? AND mutation_id = ?',
        subject,
        leaf.mutation_id,
      );
    }

    await tx.runAsync(
      'DELETE FROM local_workout_sessions WHERE subject = ?',
      subject,
    );
    checkSubject();
  });
}
