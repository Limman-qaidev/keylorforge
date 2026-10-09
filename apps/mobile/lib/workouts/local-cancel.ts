/**
 * Explicit offline-first cancellation, NOT a delete or implicit app-exit.
 *
 * Stores CANCEL_SESSION, a durable cancellation audit row, and the lifecycle
 * transition atomically. Performed sets and all prior outbox mutations remain.
 * Remote transmission and server acceptance are independent later steps.
 */
import type { SqliteWorkoutPort } from './local-schema';
import type { LocalSubjectAccess, LocalWorkoutSession } from './local-store';

// Use the shared identity format; UUID versions need not all be v4 (legacy
// canonical IDs and authenticated subjects may predate this new feature).
const ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LocalCancelInput = {
  sessionId: string;
  mutationId: string;
  cancelledAtUtc: string;
  /** Only true after the user has explicitly confirmed discarding real work. */
  confirmDiscardPerformedSets: boolean;
};

export type LocalCancelRow = {
  subject: string;
  session_id: string;
  cancel_mutation_id: string;
  cancelled_at_utc: string;
  prior_confirmed_sets: number;
};

type ExistingOutbox = {
  session_id: string;
  mutation_kind: string;
  payload_json: string;
};
type Count = { count: number };
type Dependency = { mutation_id: string };
type LastSet = { completed_at_utc: string | null };

export class LocalCancelError extends Error {
  constructor(
    public readonly code:
      | 'invalidInput'
      | 'notAuthenticated'
      | 'sessionNotActive'
      | 'alreadyTerminated'
      | 'requiresDiscardConfirmation'
      | 'missingDependency'
      | 'mutationConflict'
      | 'corruptLocalData',
  ) {
    super(code);
    this.name = 'LocalCancelError';
  }
}

function currentSubject(access: LocalSubjectAccess): string {
  const value = access.currentAuthenticatedSubject();
  if (!value || !ID.test(value)) {
    throw new LocalCancelError('notAuthenticated');
  }
  return value.toLowerCase();
}

function fence(access: LocalSubjectAccess, subject: string): void {
  if (currentSubject(access) !== subject) {
    throw new LocalCancelError('notAuthenticated');
  }
}

function normalize(input: LocalCancelInput): LocalCancelInput {
  if (
    !input ||
    typeof input.sessionId !== 'string' ||
    !ID.test(input.sessionId) ||
    typeof input.mutationId !== 'string' ||
    !ID.test(input.mutationId) ||
    input.sessionId.toLowerCase() === input.mutationId.toLowerCase() ||
    typeof input.confirmDiscardPerformedSets !== 'boolean' ||
    typeof input.cancelledAtUtc !== 'string'
  ) {
    throw new LocalCancelError('invalidInput');
  }
  const parsed = new Date(input.cancelledAtUtc);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString() !== input.cancelledAtUtc
  ) {
    throw new LocalCancelError('invalidInput');
  }
  return {
    sessionId: input.sessionId.toLowerCase(),
    mutationId: input.mutationId.toLowerCase(),
    cancelledAtUtc: input.cancelledAtUtc,
    confirmDiscardPerformedSets: input.confirmDiscardPerformedSets,
  };
}

export async function cancelLocalFreeWorkout(
  db: SqliteWorkoutPort,
  access: LocalSubjectAccess,
  raw: LocalCancelInput,
): Promise<LocalCancelRow> {
  const subject = currentSubject(access);
  const input = normalize(raw);
  let result: LocalCancelRow | null = null;
  await db.withExclusiveTransactionAsync(async (tx) => {
    fence(access, subject);
    const existingMutation = await tx.getFirstAsync<ExistingOutbox>(
      'SELECT session_id, mutation_kind, payload_json FROM local_workout_outbox WHERE subject = ? AND mutation_id = ?',
      subject,
      input.mutationId,
    );
    if (existingMutation) {
      if (
        existingMutation.mutation_kind !== 'CANCEL_SESSION' ||
        existingMutation.session_id !== input.sessionId
      ) {
        throw new LocalCancelError('mutationConflict');
      }
      let previous: unknown;
      try {
        previous = JSON.parse(existingMutation.payload_json);
      } catch {
        throw new LocalCancelError('corruptLocalData');
      }
      const row = await tx.getFirstAsync<LocalCancelRow>(
        'SELECT * FROM local_workout_cancellations WHERE subject = ? AND session_id = ?',
        subject,
        input.sessionId,
      );
      const session = await tx.getFirstAsync<LocalWorkoutSession>(
        'SELECT * FROM local_workout_sessions WHERE subject = ? AND session_id = ?',
        subject,
        input.sessionId,
      );
      const expected = {
        protocol_version: 1,
        kind: 'CANCEL_SESSION',
        session_id: input.sessionId,
        mutation_id: input.mutationId,
        cancelled_at_utc: input.cancelledAtUtc,
        confirmed_set_count: row?.prior_confirmed_sets,
        discard_performed_sets_confirmed: input.confirmDiscardPerformedSets,
      };
      if (
        !row ||
        !session ||
        row.cancel_mutation_id !== input.mutationId ||
        row.cancelled_at_utc !== input.cancelledAtUtc ||
        session.lifecycle_state !== 'cancelled' ||
        JSON.stringify(previous) !== JSON.stringify(expected)
      ) {
        throw new LocalCancelError('mutationConflict');
      }
      result = row;
      fence(access, subject);
      return;
    }
    const session = await tx.getFirstAsync<LocalWorkoutSession>(
      'SELECT * FROM local_workout_sessions WHERE subject = ? AND session_id = ?',
      subject,
      input.sessionId,
    );
    if (!session || session.lifecycle_state !== 'active') {
      throw new LocalCancelError('sessionNotActive');
    }
    if (
      session.origin !== 'free' ||
      Date.parse(input.cancelledAtUtc) < Date.parse(session.started_at_utc)
    ) {
      throw new LocalCancelError('invalidInput');
    }
    // Reject a competing terminal intent rather than overwriting history.
    const priorTerminal = await tx.getFirstAsync<Count>(
      "SELECT COUNT(*) AS count FROM local_workout_outbox WHERE subject = ? AND session_id = ? AND mutation_kind IN ('FINISH_SESSION', 'CANCEL_SESSION')",
      subject,
      input.sessionId,
    );
    if (!priorTerminal || priorTerminal.count !== 0) {
      throw new LocalCancelError('alreadyTerminated');
    }
    const count = await tx.getFirstAsync<Count>(
      'SELECT COUNT(*) AS count FROM local_workout_sets WHERE subject = ? AND session_id = ?',
      subject,
      input.sessionId,
    );
    if (!count || !Number.isSafeInteger(count.count) || count.count < 0) {
      throw new LocalCancelError('corruptLocalData');
    }
    if (count.count > 0 && !input.confirmDiscardPerformedSets) {
      throw new LocalCancelError('requiresDiscardConfirmation');
    }
    const lastSet = await tx.getFirstAsync<LastSet>(
      'SELECT MAX(completed_at_utc) AS completed_at_utc FROM local_workout_sets WHERE subject = ? AND session_id = ?',
      subject,
      input.sessionId,
    );
    if (
      (count.count > 0 && !lastSet?.completed_at_utc) ||
      (lastSet?.completed_at_utc &&
        Date.parse(input.cancelledAtUtc) <
          Date.parse(lastSet.completed_at_utc))
    ) {
      throw new LocalCancelError('invalidInput');
    }
    const parent = await tx.getFirstAsync<Dependency>(
      'SELECT mutation_id FROM local_workout_outbox WHERE subject = ? AND session_id = ? ORDER BY rowid DESC LIMIT 1',
      subject,
      input.sessionId,
    );
    if (!parent) throw new LocalCancelError('missingDependency');
    const payload = JSON.stringify({
      protocol_version: 1,
      kind: 'CANCEL_SESSION',
      session_id: input.sessionId,
      mutation_id: input.mutationId,
      cancelled_at_utc: input.cancelledAtUtc,
      confirmed_set_count: count.count,
      discard_performed_sets_confirmed: input.confirmDiscardPerformedSets,
    });
    await tx.runAsync(
      "INSERT INTO local_workout_outbox (subject, mutation_id, session_id, mutation_kind, protocol_version, payload_json, delivery_state, created_at_utc, depends_on_mutation_id) VALUES (?, ?, ?, 'CANCEL_SESSION', 1, ?, 'pending', ?, ?)",
      subject,
      input.mutationId,
      input.sessionId,
      payload,
      input.cancelledAtUtc,
      parent.mutation_id,
    );
    await tx.runAsync(
      'INSERT INTO local_workout_cancellations (subject, session_id, cancel_mutation_id, cancelled_at_utc, prior_confirmed_sets) VALUES (?, ?, ?, ?, ?)',
      subject,
      input.sessionId,
      input.mutationId,
      input.cancelledAtUtc,
      count.count,
    );
    await tx.runAsync(
      "UPDATE local_workout_sessions SET lifecycle_state = 'cancelled' WHERE subject = ? AND session_id = ? AND lifecycle_state = 'active'",
      subject,
      input.sessionId,
    );
    result = await tx.getFirstAsync<LocalCancelRow>(
      'SELECT * FROM local_workout_cancellations WHERE subject = ? AND session_id = ?',
      subject,
      input.sessionId,
    );
    const updated = await tx.getFirstAsync<LocalWorkoutSession>(
      'SELECT * FROM local_workout_sessions WHERE subject = ? AND session_id = ?',
      subject,
      input.sessionId,
    );
    if (
      !result ||
      result.cancel_mutation_id !== input.mutationId ||
      updated?.lifecycle_state !== 'cancelled'
    ) {
      throw new LocalCancelError('corruptLocalData');
    }
    fence(access, subject);
  });
  fence(access, subject);
  if (!result) throw new LocalCancelError('corruptLocalData');
  return result;
}
