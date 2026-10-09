/**
 * M3 Free Workout application boundary: local-first, never network-first.
 *
 * It coordinates EXISTING atomic SQLite domain functions and generates no
 * identifiers itself. A platform caller must provide a cryptographically
 * secure UUID factory; never use Math.random for persisted IDs.
 *
 * This is not a screen and does not schedule sync. It cannot create a
 * historical performed occurrence merely by selecting an exercise.
 */
import {
  readActiveFreeWorkoutOverview,
  type ActiveFreeWorkoutOverview,
} from './active-workout-overview';
import {
  confirmLocalWorkoutSet,
  type ConfirmedSetMeasurement,
  type LocalPerformedSet,
  type PerformedLoad,
} from './local-confirmed-sets';
import { finishLocalFreeWorkout, type LocalFinishRow } from './local-finish';
import type { SqliteWorkoutPort } from './local-schema';
import {
  startLocalFreeWorkout,
  type LocalSubjectAccess,
  type LocalWorkoutSession,
  type LocalStartWorkoutInput,
} from './local-store';

const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const busyDatabases = new WeakSet<SqliteWorkoutPort>();

export type WorkoutIdProvider = { newUuid: () => string };
export type WorkoutClock = {
  now: () => Date;
  timeZone: () => string;
};

export class WorkoutFlowError extends Error {
  constructor(
    public readonly code:
      | 'busy'
      | 'invalidInput'
      | 'noActiveWorkout'
      | 'unsupportedAgenda'
      | 'noQualifyingWork',
  ) {
    super(code);
    this.name = 'WorkoutFlowError';
  }
}

export type RecordSetRequest = {
  canonicalExerciseId: string;
  role: 'WARMUP' | 'WORKING';
  measurement: ConfirmedSetMeasurement;
  load: PerformedLoad | null;
};

async function exclusiveFlow<T>(
  db: SqliteWorkoutPort,
  task: () => Promise<T>,
): Promise<T> {
  if (busyDatabases.has(db)) {
    throw new WorkoutFlowError('busy');
  }
  busyDatabases.add(db);
  try {
    return await task();
  } finally {
    busyDatabases.delete(db);
  }
}

function generatedId(factory: WorkoutIdProvider): string {
  const value = factory.newUuid();
  if (typeof value !== 'string' || !UUID_V4.test(value)) {
    throw new WorkoutFlowError('invalidInput');
  }
  return value.toLowerCase();
}

function uniqueIds(factory: WorkoutIdProvider, count: 2): [string, string];
function uniqueIds(
  factory: WorkoutIdProvider,
  count: 3,
): [string, string, string];
function uniqueIds(
  factory: WorkoutIdProvider,
  count: 2 | 3,
): [string, string] | [string, string, string] {
  const values = Array.from({ length: count }, () => generatedId(factory));
  if (new Set(values).size !== count) {
    throw new WorkoutFlowError('invalidInput');
  }
  if (count === 2) {
    return [values[0]!, values[1]!];
  }
  return [values[0]!, values[1]!, values[2]!];
}

function nowUtc(clock: WorkoutClock): string {
  const now = clock.now();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new WorkoutFlowError('invalidInput');
  }
  return now.toISOString();
}

/**
 * Use the SAME instant and IANA zone for all local/UTC calendar fields.
 * Start's domain validator re-derives the day and offset independently.
 */
function startInput(
  factory: WorkoutIdProvider,
  clock: WorkoutClock,
): LocalStartWorkoutInput {
  const [sessionId, mutationId] = uniqueIds(factory, 2);
  const startedAtUtc = nowUtc(clock);
  const timeZone = clock.timeZone();
  if (!timeZone || typeof timeZone !== 'string') {
    throw new WorkoutFlowError('invalidInput');
  }
  let values: Record<string, string>;
  try {
    const instant = new Date(startedAtUtc);
    values = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(instant)
        .map((part) => [part.type, part.value]),
    ) as Record<string, string>;
  } catch {
    throw new WorkoutFlowError('invalidInput');
  }
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const hour = Number(values.hour);
  const minute = Number(values.minute);
  const second = Number(values.second);
  if (![year, month, day, hour, minute, second].every(Number.isInteger)) {
    throw new WorkoutFlowError('invalidInput');
  }
  const localDate = [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
  const localEpochSeconds = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
  );
  const instant = new Date(startedAtUtc);
  const utcEpochSeconds = Date.UTC(
    instant.getUTCFullYear(),
    instant.getUTCMonth(),
    instant.getUTCDate(),
    instant.getUTCHours(),
    instant.getUTCMinutes(),
    instant.getUTCSeconds(),
  );
  return {
    sessionId,
    mutationId,
    startedAtUtc,
    timeZone,
    utcOffsetMinutes: Math.floor(
      (localEpochSeconds - utcEpochSeconds) / 60_000,
    ),
    localDate,
  };
}

export async function beginFreeWorkout(
  db: SqliteWorkoutPort,
  access: LocalSubjectAccess,
  ids: WorkoutIdProvider,
  clock: WorkoutClock,
): Promise<LocalWorkoutSession> {
  return exclusiveFlow(db, () =>
    startLocalFreeWorkout(db, access, startInput(ids, clock)),
  );
}

function requireActive(
  overview: ActiveFreeWorkoutOverview | null,
): ActiveFreeWorkoutOverview {
  if (!overview) {
    throw new WorkoutFlowError('noActiveWorkout');
  }
  if (
    overview.session.origin !== 'free' ||
    overview.session.agenda_revision !== 0
  ) {
    throw new WorkoutFlowError('unsupportedAgenda');
  }
  return overview;
}

/**
 * For this initial Free Workout scope the same canonical exercise reuses its
 * existing occurrence; a first set creates an occurrence failure-atomically.
 * Unconfirmed exercise selection is NEVER stored as performed history.
 */
export async function recordFreeWorkoutSet(
  db: SqliteWorkoutPort,
  access: LocalSubjectAccess,
  ids: WorkoutIdProvider,
  clock: WorkoutClock,
  request: RecordSetRequest,
): Promise<LocalPerformedSet> {
  return exclusiveFlow(db, async () => {
    if (
      !request ||
      typeof request.canonicalExerciseId !== 'string' ||
      !CANONICAL_UUID.test(request.canonicalExerciseId) ||
      !['WORKING', 'WARMUP'].includes(request.role)
    ) {
      throw new WorkoutFlowError('invalidInput');
    }
    const overview = requireActive(
      await readActiveFreeWorkoutOverview(db, access),
    );
    const matching = overview.exercises.find(
      (entry) =>
        entry.canonical_exercise_id ===
        request.canonicalExerciseId.toLowerCase(),
    );
    const [setId, mutationId, newOccurrenceId] = uniqueIds(ids, 3);
    const occurrenceId = matching?.occurrence_id ?? newOccurrenceId;
    if (
      setId === overview.session.session_id ||
      mutationId === overview.session.session_id ||
      occurrenceId === overview.session.session_id
    ) {
      throw new WorkoutFlowError('invalidInput');
    }
    const nextOrder =
      overview.exercises.length === 0
        ? 0
        : Math.max(...overview.exercises.map((item) => item.actual_order)) + 1;
    return confirmLocalWorkoutSet(db, access, {
      sessionId: overview.session.session_id,
      mutationId,
      setId,
      occurrenceId,
      canonicalExerciseId: request.canonicalExerciseId,
      agendaItemId: null,
      actualOrder: matching?.actual_order ?? nextOrder,
      firstSet: !matching,
      setRole: request.role,
      measurement: request.measurement,
      load: request.load,
      machine: null,
      targetAtConfirmation: null,
      completedAtUtc: nowUtc(clock),
    });
  });
}

/** Local Finish only. Queued remote transport is a separate worker boundary. */
export async function endFreeWorkout(
  db: SqliteWorkoutPort,
  access: LocalSubjectAccess,
  ids: WorkoutIdProvider,
  clock: WorkoutClock,
): Promise<LocalFinishRow> {
  return exclusiveFlow(db, async () => {
    const overview = requireActive(
      await readActiveFreeWorkoutOverview(db, access),
    );
    if (overview.workingSets < 1) {
      throw new WorkoutFlowError('noQualifyingWork');
    }
    const [mutationId, completionSnapshotId] = uniqueIds(ids, 2);
    return finishLocalFreeWorkout(db, access, {
      sessionId: overview.session.session_id,
      mutationId,
      completionSnapshotId,
      finishedAtUtc: nowUtc(clock),
    });
  });
}
