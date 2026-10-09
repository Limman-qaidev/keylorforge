import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Pressable, Text, View } from 'react-native';

import { FreeWorkoutExperience } from '../free-workout-experience';
import { useAuth } from '@/lib/auth/auth-provider';
import { useCachedExerciseCatalogue } from '@/lib/exercises/use-cached-exercise-catalogue';
import { readActiveFreeWorkoutOverview } from '@/lib/workouts/active-workout-overview';
import { openLocalWorkoutDatabase } from '@/lib/workouts/expo-sqlite-adapter';
import {
  beginFreeWorkout,
  endFreeWorkout,
  recordFreeWorkoutSet,
} from '@/lib/workouts/free-workout-flow';
import { listLocalFinishedWorkouts } from '@/lib/workouts/local-finish-history';

jest.mock('@/lib/auth/auth-provider', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/exercises/use-cached-exercise-catalogue', () => ({
  useCachedExerciseCatalogue: jest.fn(),
}));
jest.mock('@/lib/workouts/active-workout-overview', () => ({
  readActiveFreeWorkoutOverview: jest.fn(),
}));
jest.mock('@/lib/workouts/expo-sqlite-adapter', () => ({
  openLocalWorkoutDatabase: jest.fn(),
}));
jest.mock('@/lib/workouts/free-workout-flow', () => ({
  beginFreeWorkout: jest.fn(),
  endFreeWorkout: jest.fn(),
  recordFreeWorkoutSet: jest.fn(),
}));
jest.mock('@/lib/workouts/local-finish-history', () => ({
  listLocalFinishedWorkouts: jest.fn(),
}));
jest.mock('@/lib/workouts/native-workout-platform', () => ({
  secureWorkoutIds: { newUuid: () => 'c226a777-d460-4d5f-bad6-f75667a9d022' },
  deviceWorkoutClock: {
    now: () => new Date('2026-10-09T15:00:00.000Z'),
    timeZone: () => 'Europe/Madrid',
  },
}));
jest.mock('@/components/exercises/exercise-catalog-screen', () => ({
  ExerciseCatalogScreen: ({
    onChooseExercise,
  }: {
    onChooseExercise?: (exercise: unknown) => void;
  }) => (
    <View>
      <Text>CATÁLOGO CANÓNICO</Text>
      {onChooseExercise ? (
        <Pressable
          onPress={() =>
            onChooseExercise({
              id: '502c4c87-80a5-4567-9aaf-296e43bfc4d1',
              name: 'Press de banca',
              measurement_type: 'reps',
            })
          }
        >
          <Text>Elegir Press de banca</Text>
        </Pressable>
      ) : null}
    </View>
  ),
}));

const OWNER = 'a3dbf764-e0e3-41aa-9895-6e58eadfbb14';
const SESSION = '1f2d27bc-4904-4f4f-9367-39565d78f211';
const session = {
  subject: OWNER,
  session_id: SESSION,
  lifecycle_state: 'active' as const,
  origin: 'free' as const,
  started_at_utc: '2026-10-09T14:00:00.000Z',
  time_zone: 'Europe/Madrid',
  utc_offset_minutes: 120,
  local_date: '2026-10-09',
  original_agenda_json: '{"schema_version":1,"origin":"free","items":[]}',
  agenda_revision: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useAuth).mockReturnValue({
    session: { user: { id: OWNER } },
  } as unknown as ReturnType<typeof useAuth>);
  jest.mocked(useCachedExerciseCatalogue).mockReturnValue({
    initialized: true,
    snapshot: { items: [] },
  } as unknown as ReturnType<typeof useCachedExerciseCatalogue>);
  jest.mocked(openLocalWorkoutDatabase).mockResolvedValue(
    {} as Awaited<ReturnType<typeof openLocalWorkoutDatabase>>,
  );
  jest.mocked(listLocalFinishedWorkouts).mockResolvedValue([]);
  jest.mocked(readActiveFreeWorkoutOverview).mockResolvedValue(null);
  jest.mocked(beginFreeWorkout).mockResolvedValue(session);
  jest.mocked(recordFreeWorkoutSet).mockResolvedValue(
    {} as Awaited<ReturnType<typeof recordFreeWorkoutSet>>,
  );
  jest.mocked(endFreeWorkout).mockResolvedValue(
    {} as Awaited<ReturnType<typeof endFreeWorkout>>,
  );
});

describe('staged real Free Workout UI', () => {
  it('preserves the normal catalogue until a real Free Workout is explicitly started', async () => {
    const screen = await render(<FreeWorkoutExperience />);
    expect(await screen.findByText('CATÁLOGO CANÓNICO')).toBeTruthy();
    expect(await screen.findByText('Iniciar entrenamiento libre')).toBeTruthy();
    expect(beginFreeWorkout).not.toHaveBeenCalled();
    expect(recordFreeWorkoutSet).not.toHaveBeenCalled();
    expect(endFreeWorkout).not.toHaveBeenCalled();
  });

  it('recovers an existing session, refuses empty Finish and records only a confirmed set', async () => {
    jest.mocked(readActiveFreeWorkoutOverview).mockResolvedValue({
      session,
      exercises: [],
      totalSets: 0,
      workingSets: 0,
    });
    const screen = await render(<FreeWorkoutExperience />);
    expect(await screen.findByText('Entrenamiento activo')).toBeTruthy();
    expect(
      screen.getByText(
        'Necesitas confirmar al menos una serie de trabajo para finalizar.',
      ),
    ).toBeTruthy();
    const finishButton = screen.getByRole('button', {
      name: 'Finalizar entrenamiento',
    });
    expect(finishButton.props.accessibilityState?.disabled).toBe(true);

    fireEvent.press(screen.getByText('Añadir ejercicio o serie'));
    expect(await screen.findByText('CATÁLOGO CANÓNICO')).toBeTruthy();
    fireEvent.press(screen.getByText('Elegir Press de banca'));
    expect(await screen.findByText('REGISTRAR SERIE')).toBeTruthy();
    expect(recordFreeWorkoutSet).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('Cantidad realizada'), '8');
    fireEvent.press(screen.getByText('Confirmar serie'));
    await waitFor(() =>
      expect(recordFreeWorkoutSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          canonicalExerciseId: '502c4c87-80a5-4567-9aaf-296e43bfc4d1',
          role: 'WORKING',
          measurement: { measurementType: 'reps', reps: 8 },
          load: null,
        }),
      ),
    );
    expect(endFreeWorkout).not.toHaveBeenCalled();
  });
});
