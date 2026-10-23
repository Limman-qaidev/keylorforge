import { requestApi } from '../../api/client';
import {
  syncNextPendingExerciseNote,
} from '../exercise-note-sync';
import type { SqliteWorkoutPort } from '../local-schema';
import type { StartSyncAccess } from '../start-session-sync';

jest.mock('../../api/client', () => ({ requestApi: jest.fn() }));

const OWNER = 'a3dbf764-e0e3-41aa-9895-6e58eadfbb14';
const SESSION = '1f2d27bc-4904-4f4f-9367-39565d78f211';
const OCCURRENCE = 'c226a777-d460-4d5f-bad6-f75667a9d022';
const EXERCISE = '502c4c87-80a5-4567-9aaf-296e43bfc4d1';
const NOTE_ID = 'c977f8e2-3b12-4d94-98ae-c42c678d10f1';
const note = {
  subject: OWNER, session_id: SESSION, occurrence_id: OCCURRENCE,
  canonical_exercise_id: EXERCISE, note_event_id: NOTE_ID,
  body: 'Máquina derecha: menor recorrido',
  created_at_utc: '2026-10-23T10:38:00.000Z', delivery_state: 'pending',
};

function fixture(deliveryState = 'acknowledged') {
  let state = 'pending';
  let subject: string | null = OWNER;
  const runAsync = jest.fn(async (_sql: string, nextState: string) => {
    state = nextState;
  });
  const db = {
    getFirstAsync: jest.fn(async (sql: string) => {
      if (sql.includes('FROM local_exercise_note_events')) {
        return state === 'pending' ? { ...note, delivery_state: state } : null;
      }
      return { canonical_exercise_id: EXERCISE, delivery_state: deliveryState };
    }),
    withExclusiveTransactionAsync: jest.fn(
      async (job: (tx: { getFirstAsync: unknown; runAsync: unknown }) => Promise<void>) =>
        job({
          getFirstAsync: jest.fn(async () => ({ ...note, delivery_state: state })),
          runAsync,
        }),
    ),
  } as unknown as SqliteWorkoutPort;
  const access: StartSyncAccess = {
    currentAuthenticatedSubject: () => subject,
    acquireCurrentCredentials: async () =>
      subject ? { subject, accessToken: 'valid-token' } : null,
  };
  return { db, access, runAsync, switchUser: () => { subject = null; } };
}

beforeEach(() => jest.clearAllMocks());

describe('M3 durable notes synchronization', () => {
  it('never sends before first confirmed set is acknowledged', async () => {
    const { db, access } = fixture('pending');
    expect(await syncNextPendingExerciseNote(db, access)).toEqual({
      state: 'blocked', reason: 'dependency',
    });
    expect(requestApi).not.toHaveBeenCalled();
  });

  it('sends the immutable original event and ACKs only matching receipt', async () => {
    const { db, access, runAsync } = fixture();
    jest.mocked(requestApi).mockResolvedValue({
      status: 201,
      json: async () => ({
        note_event_id: NOTE_ID, session_id: SESSION,
        occurrence_id: OCCURRENCE, canonical_exercise_id: EXERCISE,
        body: note.body, created_at_utc: note.created_at_utc,
      }),
    } as Response);
    expect(await syncNextPendingExerciseNote(db, access)).toEqual({
      state: 'acknowledged', mutationId: NOTE_ID,
    });
    expect(requestApi).toHaveBeenCalledWith(
      `/workout-sessions/${SESSION}/notes`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer valid-token',
        }),
      }),
    );
    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE local_exercise_note_events'),
      'acknowledged', OWNER, NOTE_ID,
    );
  });

  it('preserves original pending event when receipt mismatches', async () => {
    const { db, access, runAsync } = fixture();
    jest.mocked(requestApi).mockResolvedValue({
      status: 201, json: async () => ({ ...note, body: 'altered' }),
    } as Response);
    expect(await syncNextPendingExerciseNote(db, access)).toEqual({
      state: 'retryable', reason: 'invalidResponse',
    });
    expect(runAsync).not.toHaveBeenCalled();
  });

  it('does not send another account note after logout while reading SQLite', async () => {
    const { db, access, switchUser } = fixture();
    jest.mocked(db.getFirstAsync).mockImplementationOnce(async () => {
      switchUser();
      return note;
    });
    await expect(syncNextPendingExerciseNote(db, access))
      .rejects.toThrow('notAuthenticated');
    expect(requestApi).not.toHaveBeenCalled();
  });
});
