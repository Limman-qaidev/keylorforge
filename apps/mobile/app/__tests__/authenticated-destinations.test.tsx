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

describe('authenticated product destinations', () => {
  it('renders a truthful Progress placeholder without fabricated metrics', () => {
    const { getByText } = render(<ProgressRoute />);

    expect(getByText('Progreso')).toBeTruthy();
    expect(
      getByText(
        'Esta sección todavía no contiene datos ni funciones de entrenamiento.',
      ),
    ).toBeTruthy();
  });

  it('renders a truthful Training placeholder without fake workouts', () => {
    const { getByText } = render(<TrainRoute />);

    expect(getByText('Entrenar')).toBeTruthy();
    expect(
      getByText(
        'Este será el punto de entrada para empezar, continuar y configurar entrenamientos cuando llegue su funcionalidad de dominio.',
      ),
    ).toBeTruthy();
  });

  it('renders a truthful Social placeholder without fake rankings or friends', () => {
    const { getByText } = render(<SocialRoute />);

    expect(getByText('Social')).toBeTruthy();
    expect(
      getByText(
        'La experiencia social aparecerá aquí cuando existan funciones reales de amigos, retos o rankings.',
      ),
    ).toBeTruthy();
  });
});
