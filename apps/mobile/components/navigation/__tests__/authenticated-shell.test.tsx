import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { AuthenticatedShell } from '../authenticated-shell';

jest.mock('expo-router', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => {
    const { View } = jest.requireActual('react-native');
    return <View accessibilityLabel={`route:${href}`}>{children}</View>;
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: ReactNode }) => {
    const { View } = jest.requireActual('react-native');
    return <View>{children}</View>;
  },
}));

describe('AuthenticatedShell', () => {
  it('exposes exactly the five approved authenticated destinations', async () => {
    const { getAllByRole, getByLabelText } = await render(
      <AuthenticatedShell activeDestination="home">
        <Text>real home</Text>
      </AuthenticatedShell>,
    );

    expect(getAllByRole('tab')).toHaveLength(5);
    expect(getByLabelText('Inicio')).toBeTruthy();
    expect(getByLabelText('Progreso')).toBeTruthy();
    expect(getByLabelText('Entrenar')).toBeTruthy();
    expect(getByLabelText('Social')).toBeTruthy();
    expect(getByLabelText('Perfil')).toBeTruthy();
  });

  it('routes every destination and keeps Entrenar as the primary action', async () => {
    const { getByLabelText, getByTestId, getByText, queryByText } =
      await render(
        <AuthenticatedShell activeDestination="train">
          <Text>training destination</Text>
        </AuthenticatedShell>,
      );

    expect(getByLabelText('route:/home')).toBeTruthy();
    expect(getByLabelText('route:/progress')).toBeTruthy();
    expect(getByLabelText('route:/train')).toBeTruthy();
    expect(getByLabelText('route:/social')).toBeTruthy();
    expect(getByLabelText('route:/profile')).toBeTruthy();
    expect(getByTestId('primary-training-destination')).toBeTruthy();
    expect(getByText('ϟ')).toBeTruthy();
    expect(queryByText('+')).toBeNull();
    expect(getByLabelText('Entrenar').props.accessibilityState).toEqual({
      selected: true,
    });
  });

  it('renders real destination content inside the shell', async () => {
    const { getByText } = await render(
      <AuthenticatedShell activeDestination="profile">
        <Text>server-backed profile</Text>
      </AuthenticatedShell>,
    );

    expect(getByText('server-backed profile')).toBeTruthy();
  });
});
