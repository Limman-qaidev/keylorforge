import { fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { AuthenticatedShell } from '../authenticated-shell';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: ReactNode }) => {
    const { View } = jest.requireActual('react-native');
    return <View>{children}</View>;
  },
}));

describe('AuthenticatedShell', () => {
  beforeEach(() => {
    mockReplace.mockClear();
  });

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
    const { getByLabelText, getByTestId, queryByTestId } = await render(
      <AuthenticatedShell activeDestination="train">
        <Text>training destination</Text>
      </AuthenticatedShell>,
    );

    fireEvent.press(getByLabelText('Inicio'));
    expect(mockReplace).toHaveBeenLastCalledWith('/home');

    fireEvent.press(getByLabelText('Progreso'));
    expect(mockReplace).toHaveBeenLastCalledWith('/progress');

    fireEvent.press(getByLabelText('Entrenar'));
    expect(mockReplace).toHaveBeenLastCalledWith('/train');

    fireEvent.press(getByLabelText('Social'));
    expect(mockReplace).toHaveBeenLastCalledWith('/social');

    fireEvent.press(getByLabelText('Perfil'));
    expect(mockReplace).toHaveBeenLastCalledWith('/profile');

    expect(getByTestId('primary-training-destination')).toBeTruthy();
    expect(getByTestId('primary-training-icon')).toBeTruthy();
    expect(queryByTestId('primary-training-brand-mark')).toBeNull();
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
