import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import ProgressRoute from '../progress';
import SocialRoute from '../social';
import TrainRoute from '../train';

jest.mock('@/components/auth/auth-guards', () => ({
  RequireAuthenticated: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('@/components/navigation/authenticated-shell', () => ({
  AuthenticatedShell: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('@/components/exercises/exercise-catalog-screen', () => {
  const { Text } = jest.requireActual('react-native');

  return {
    ExerciseCatalogScreen: () => <Text>Catálogo de ejercicios</Text>,
  };
});

describe('authenticated product destinations', () => {
  it('renders a truthful Progress placeholder without fabricated metrics', async () => {
    const { getByText } = await render(<ProgressRoute />);

    expect(getByText('Progreso')).toBeTruthy();
    expect(
      getByText(
        'Esta sección todavía no contiene datos ni funciones de entrenamiento.',
      ),
    ).toBeTruthy();
  });

  it('renders the real exercise catalogue inside Entrenar', async () => {
    const { getByText } = await render(<TrainRoute />);

    expect(getByText('Catálogo de ejercicios')).toBeTruthy();
  });

  it('renders a truthful Social placeholder without fake rankings or friends', async () => {
    const { getByText } = await render(<SocialRoute />);

    expect(getByText('Social')).toBeTruthy();
    expect(
      getByText(
        'La experiencia social aparecerá aquí cuando existan funciones reales de amigos, retos o rankings.',
      ),
    ).toBeTruthy();
  });
});
