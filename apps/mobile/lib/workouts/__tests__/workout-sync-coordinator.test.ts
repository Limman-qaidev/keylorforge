import { syncNextPendingStart } from '../start-session-sync';
import { syncNextPendingMachineCreate } from '../machine-create-sync';
import { syncNextPendingConfirmedSet } from '../confirmed-set-sync';
import { syncNextPendingFinish } from '../finish-session-sync';
import { syncNextPendingCancel } from '../cancel-session-sync';
import { syncNextPendingExerciseNote } from '../exercise-note-sync';
import { drainWorkoutSync } from '../workout-sync-coordinator';
import type { SqliteWorkoutPort } from '../local-schema';
import type { StartSyncAccess } from '../start-session-sync';

jest.mock('../start-session-sync', () => ({
  syncNextPendingStart: jest.fn(),
}));
jest.mock('../machine-create-sync', () => ({
  syncNextPendingMachineCreate: jest.fn(),
}));
jest.mock('../confirmed-set-sync', () => ({
  syncNextPendingConfirmedSet: jest.fn(),
}));
jest.mock('../finish-session-sync', () => ({
  syncNextPendingFinish: jest.fn(),
}));
jest.mock('../cancel-session-sync', () => ({
  syncNextPendingCancel: jest.fn(),
}));
jest.mock('../exercise-note-sync', () => ({
  syncNextPendingExerciseNote: jest.fn(),
}));

const OWNER = 'a3dbf764-e0e3-41aa-9895-6e58eadfbb14';
const OTHER = 'e426dd13-344a-4b69-8920-cb014715c6c1';
const db = {} as SqliteWorkoutPort;

function auth() {
  let subject: string | null = OWNER;
  return {
    access: {
      currentAuthenticatedSubject: () => subject,
      acquireCurrentCredentials: async () => ({
        subject: OWNER,
        accessToken: 'not-persisted',
      }),
    } satisfies StartSyncAccess,
    switchTo(value: string | null) {
      subject = value;
    },
  };
}
function noWork() {
  jest.mocked(syncNextPendingStart).mockResolvedValue({ state: 'idle' });
  jest
    .mocked(syncNextPendingMachineCreate)
    .mockResolvedValue({ state: 'idle' });
  jest.mocked(syncNextPendingConfirmedSet).mockResolvedValue({
    state: 'idle',
  });
  jest.mocked(syncNextPendingFinish).mockResolvedValue({ state: 'idle' });
  jest.mocked(syncNextPendingCancel).mockResolvedValue({ state: 'idle' });
  jest.mocked(syncNextPendingExerciseNote).mockResolvedValue({ state: 'idle' });
}

beforeEach(() => {
  jest.clearAllMocks();
  noWork();
});

describe('bounded causal Workout M3 sync coordinator', () => {
  it('drains Start, machines, sets, Finish, Cancel in dependency priority', async () => {
    const order: string[] = [];
    for (const [name, fn] of [
      ['start', syncNextPendingStart],
      ['machine', syncNextPendingMachineCreate],
      ['set', syncNextPendingConfirmedSet],
      ['finish', syncNextPendingFinish],
      ['cancel', syncNextPendingCancel],
    ] as const) {
      let first = true;
      jest.mocked(fn).mockImplementation(async () => {
        order.push(name);
        if (!first) return { state: 'idle' };
        first = false;
        return { state: 'acknowledged', mutationId: OWNER };
      });
    }
    expect(await drainWorkoutSync(db, auth().access)).toEqual({
      state: 'idle',
      acknowledged: 5,
    });
    expect(order).toEqual([
      'start',
      'start',
      'machine',
      'start',
      'machine',
      'set',
      'start',
      'machine',
      'set',
      'finish',
      'start',
      'machine',
      'set',
      'finish',
      'cancel',
      'start',
      'machine',
      'set',
      'finish',
      'cancel',
      'note',
    ]);
  });

  it('drains earlier FINISH before retrying an offline START for the next session', async () => {
    const order: string[] = [];
    let startCalls = 0;
    let finishCalls = 0;
    jest.mocked(syncNextPendingStart).mockImplementation(async () => {
      startCalls++;
      order.push('start');
      if (startCalls === 1) return { state: 'blocked', reason: 'dependency' };
      if (startCalls === 2) return { state: 'acknowledged', mutationId: OTHER };
      return { state: 'idle' };
    });
    jest.mocked(syncNextPendingFinish).mockImplementation(async () => {
      finishCalls++;
      order.push('finish');
      return finishCalls === 1
        ? { state: 'acknowledged', mutationId: OWNER }
        : { state: 'idle' };
    });
    expect(await drainWorkoutSync(db, auth().access)).toEqual({
      state: 'idle',
      acknowledged: 2,
    });
    expect(order).toEqual(['start', 'finish', 'start', 'start', 'finish']);
  });

  it('allows independent machine progress when a workout set awaits a dependency', async () => {
    jest.mocked(syncNextPendingStart).mockResolvedValue({ state: 'idle' });
    jest
      .mocked(syncNextPendingMachineCreate)
      .mockResolvedValueOnce({
        state: 'blocked',
        reason: 'dependency',
      })
      .mockResolvedValueOnce({
        state: 'acknowledged',
        mutationId: OWNER,
      });
    jest.mocked(syncNextPendingConfirmedSet).mockResolvedValueOnce({
      state: 'acknowledged',
      mutationId: OTHER,
    });
    expect(await drainWorkoutSync(db, auth().access, 2)).toEqual({
      state: 'yielded',
      acknowledged: 2,
    });
  });

  it('does not spin or send downstream mutations on lost connectivity', async () => {
    jest.mocked(syncNextPendingStart).mockResolvedValue({
      state: 'retryable',
      reason: 'network',
    });
    expect(await drainWorkoutSync(db, auth().access)).toEqual({
      state: 'paused',
      acknowledged: 0,
      stage: 'start',
      reason: 'network',
    });
    expect(syncNextPendingMachineCreate).not.toHaveBeenCalled();
    expect(syncNextPendingConfirmedSet).not.toHaveBeenCalled();
    expect(syncNextPendingFinish).not.toHaveBeenCalled();
    expect(syncNextPendingCancel).not.toHaveBeenCalled();
  });

  it('stops after conflicts, rejects invalid batches and releases lock', async () => {
    await expect(drainWorkoutSync(db, auth().access, 0)).rejects.toThrow(
      'invalidSyncBatch',
    );
    await expect(drainWorkoutSync(db, auth().access, 31)).rejects.toThrow(
      'invalidSyncBatch',
    );
    jest.mocked(syncNextPendingMachineCreate).mockResolvedValueOnce({
      state: 'conflict',
      mutationId: OTHER,
    });
    expect(await drainWorkoutSync(db, auth().access)).toEqual({
      state: 'paused',
      acknowledged: 0,
      stage: 'machine',
      reason: 'conflict',
    });
    expect(await drainWorkoutSync(db, auth().access)).toEqual({
      state: 'idle',
      acknowledged: 0,
    });
  });

  it('never returns or dispatches a second owner after logout during an await', async () => {
    const who = auth();
    jest.mocked(syncNextPendingStart).mockImplementation(async () => {
      who.switchTo(null);
      return { state: 'acknowledged', mutationId: OWNER };
    });
    await expect(drainWorkoutSync(db, who.access)).rejects.toThrow(
      'notAuthenticated',
    );
    expect(syncNextPendingMachineCreate).not.toHaveBeenCalled();
    expect(syncNextPendingConfirmedSet).not.toHaveBeenCalled();
  });

  it('keeps a single-flight guard per database while an HTTP action is in progress', async () => {
    let finish!: (value: { state: 'idle' }) => void;
    jest.mocked(syncNextPendingStart).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = drainWorkoutSync(db, auth().access);
    expect(await drainWorkoutSync(db, auth().access)).toEqual({
      state: 'busy',
      acknowledged: 0,
    });
    finish({ state: 'idle' });
    expect(await first).toEqual({ state: 'idle', acknowledged: 0 });
  });

  it('pauses without spinning when a causal predecessor cannot be acknowledged', async () => {
    jest.mocked(syncNextPendingConfirmedSet).mockResolvedValue({
      state: 'blocked',
      reason: 'dependency',
    });
    expect(await drainWorkoutSync(db, auth().access)).toEqual({
      state: 'paused',
      acknowledged: 0,
      stage: 'set',
      reason: 'dependency',
    });
    expect(syncNextPendingConfirmedSet).toHaveBeenCalledTimes(1);
  });

  it('stops on a lost START receipt, then resumes all causal operations exactly once', async () => {
    const who = auth();
    jest
      .mocked(syncNextPendingStart)
      .mockResolvedValueOnce({ state: 'retryable', reason: 'network' })
      .mockResolvedValueOnce({ state: 'acknowledged', mutationId: OWNER })
      .mockResolvedValue({ state: 'idle' });
    jest
      .mocked(syncNextPendingConfirmedSet)
      .mockResolvedValueOnce({ state: 'acknowledged', mutationId: OTHER })
      .mockResolvedValue({ state: 'idle' });
    jest
      .mocked(syncNextPendingFinish)
      .mockResolvedValueOnce({ state: 'acknowledged', mutationId: OWNER })
      .mockResolvedValue({ state: 'idle' });

    expect(await drainWorkoutSync(db, who.access)).toEqual({
      state: 'paused',
      acknowledged: 0,
      stage: 'start',
      reason: 'network',
    });
    expect(syncNextPendingConfirmedSet).not.toHaveBeenCalled();
    expect(syncNextPendingFinish).not.toHaveBeenCalled();

    expect(await drainWorkoutSync(db, who.access)).toEqual({
      state: 'idle',
      acknowledged: 3,
    });
    expect(syncNextPendingConfirmedSet).toHaveBeenCalledTimes(3);
    expect(syncNextPendingFinish).toHaveBeenCalledTimes(2);
    expect(await drainWorkoutSync(db, who.access)).toEqual({
      state: 'idle',
      acknowledged: 0,
    });
  });

  it('interrupts after a subject swap mid-request and releases the drain guard', async () => {
    const who = auth();
    jest.mocked(syncNextPendingStart).mockImplementationOnce(async () => {
      who.switchTo(OTHER);
      return { state: 'acknowledged', mutationId: OWNER };
    });
    await expect(drainWorkoutSync(db, who.access)).rejects.toThrow(
      'notAuthenticated',
    );
    expect(syncNextPendingMachineCreate).not.toHaveBeenCalled();
    expect(syncNextPendingConfirmedSet).not.toHaveBeenCalled();
    expect(syncNextPendingFinish).not.toHaveBeenCalled();

    // A new drain is not blocked by the previous owner's in-flight lock.
    noWork();
    expect(await drainWorkoutSync(db, who.access)).toEqual({
      state: 'idle',
      acknowledged: 0,
    });
  });
});
