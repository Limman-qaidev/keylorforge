import { render, userEvent } from '@testing-library/react-native';

import TrainRoute from '../train';

jest.mock('@/components/auth/auth-guards', () => ({
  RequireAuthenticated: ({ children }: { children: React.ReactNode }) =>
    children,
}));
jest.mock('@/components/navigation/authenticated-shell', () => ({
  AuthenticatedShell: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/components/exercises/exercise-catalog-screen', () => {
  const { Text } = jest.requireActual('react-native');
  return { ExerciseCatalogScreen: () => <Text>CATÁLOGO NORMAL</Text> };
});
jest.mock('@/components/workouts/free-workout-experience', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    FreeWorkoutExperience: ({
      isolatedPreview,
    }: {
      isolatedPreview: boolean;
    }) => (
      <Text>{isolatedPreview ? 'ENTRENAMIENTO AISLADO' : 'NO AISLADO'}</Text>
    ),
  };
});

describe('Entrenar isolated development preview', () => {
  it('keeps the canonical catalogue until explicitly entering and leaving QA', async () => {
    const user = userEvent.setup();
    const screen = await render(<TrainRoute />);
    expect(screen.getByText('CATÁLOGO NORMAL')).toBeTruthy();
    expect(screen.queryByText('ENTRENAMIENTO AISLADO')).toBeNull();
    await user.press(screen.getByText('Probar entrenamiento (datos aislados)'));
    expect(screen.getByText('ENTRENAMIENTO AISLADO')).toBeTruthy();
    expect(screen.queryByText('CATÁLOGO NORMAL')).toBeNull();
    await user.press(screen.getByText('Volver al catálogo'));
    expect(screen.getByText('CATÁLOGO NORMAL')).toBeTruthy();
  });
});
