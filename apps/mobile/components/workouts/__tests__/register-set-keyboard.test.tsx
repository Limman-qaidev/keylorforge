import { act, fireEvent, render } from '@testing-library/react-native';
import { Keyboard } from 'react-native';

import { RegisterSetV2 } from '../workout-v2-screens';

type Handler = () => void;

function mockKeyboard() {
  const handlers = new Map<string, Handler>();
  const remove = jest.fn();
  jest
    .spyOn(Keyboard, 'addListener')
    .mockImplementation((event: string, cb: unknown) => {
      handlers.set(event, cb as Handler);
      return { remove } as never;
    });
  const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  const emit = (name: 'Show' | 'Hide') =>
    act(() => {
      // Platform.OS is 'ios' under the default jest-expo preset, 'android'
      // otherwise: fire whichever variant was registered.
      (handlers.get(`keyboardDid${name}`) ??
        handlers.get(`keyboardWill${name}`))?.();
    });
  return { emit, dismiss, remove };
}

const chosen = (measurement_type: 'reps' | 'time' | 'distance') => ({
  id: 'ex-1',
  name: 'Press banca',
  measurement_type,
});

function renderForm(
  measurement: 'reps' | 'time' | 'distance' = 'reps',
  confirmedCount = 0,
) {
  const onConfirm = jest.fn();
  const onBack = jest.fn();
  const confirmedSets = Array.from({ length: confirmedCount }, (_, index) => ({
    set_id: `s${index}`,
    set_role: 'WORKING',
    measurement_type: 'reps',
    reps: 8,
    duration_seconds: null,
    distance_decimal: null,
    distance_unit: null,
    load_decimal: '25',
    load_unit: 'kg',
  }));
  const utils = render(
    <RegisterSetV2
      chosen={chosen(measurement)}
      confirmedSets={confirmedSets as never}
      role="WORKING"
      onRole={jest.fn()}
      quantity="8"
      onQuantity={jest.fn()}
      load="25"
      onLoad={jest.fn()}
      unit="kg"
      onUnit={jest.fn()}
      distanceUnit="m"
      onDistanceUnit={jest.fn()}
      busy={false}
      error={null}
      onConfirm={onConfirm}
      onBack={onBack}
    />,
  );
  return { ...utils, onConfirm, onBack };
}

afterEach(() => jest.restoreAllMocks());

describe('RegisterSetV2 keyboard handling', () => {
  it.each([
    ['reps', 'Cantidad realizada'],
    ['reps', 'Carga total opcional'],
    ['time', 'Cantidad realizada'],
    ['distance', 'Cantidad realizada'],
  ] as const)(
    'swaps the CTA footer for a Listo bar while %s field "%s" is edited',
    (measurement, label) => {
      const kb = mockKeyboard();
      const screen = renderForm(measurement, 2);
      expect(screen.getByTestId('register-set-footer')).toBeTruthy();

      fireEvent(screen.getByLabelText(label), 'focus');
      kb.emit('Show');

      expect(screen.queryByTestId('register-set-footer')).toBeNull();
      expect(screen.getByTestId('register-set-keyboard-bar')).toBeTruthy();
      expect(screen.queryByText('Confirmar otra serie')).toBeNull();

      fireEvent.press(screen.getByText('Listo'));
      expect(kb.dismiss).toHaveBeenCalledTimes(1);

      kb.emit('Hide');
      expect(screen.getByTestId('register-set-footer')).toBeTruthy();
      expect(screen.queryByTestId('register-set-keyboard-bar')).toBeNull();
      expect(screen.getByText('Confirmar otra serie')).toBeTruthy();
      expect(screen.getByText('Terminar ejercicio')).toBeTruthy();
    },
  );

  it('restores the footer on blur even if keyboardDidHide never arrives', () => {
    const kb = mockKeyboard();
    const screen = renderForm('reps', 1);
    const reps = screen.getByLabelText('Cantidad realizada');
    fireEvent(reps, 'focus');
    kb.emit('Show');
    expect(screen.queryByTestId('register-set-footer')).toBeNull();

    fireEvent(reps, 'blur');
    expect(screen.getByTestId('register-set-footer')).toBeTruthy();
  });

  it('keeps the bar when focus alternates between load and reps', () => {
    const kb = mockKeyboard();
    const screen = renderForm('reps', 1);
    const reps = screen.getByLabelText('Cantidad realizada');
    const load = screen.getByLabelText('Carga total opcional');
    fireEvent(reps, 'focus');
    kb.emit('Show');
    act(() => {
      fireEvent(reps, 'blur');
      fireEvent(load, 'focus');
    });
    expect(screen.getByTestId('register-set-keyboard-bar')).toBeTruthy();
    expect(screen.queryByTestId('register-set-footer')).toBeNull();
  });

  it('does not regress CTAs once the keyboard is closed', () => {
    const kb = mockKeyboard();
    const screen = renderForm('reps', 1);
    fireEvent(screen.getByLabelText('Cantidad realizada'), 'focus');
    kb.emit('Show');
    kb.emit('Hide');

    fireEvent.press(screen.getByText('Confirmar otra serie'));
    expect(screen.onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByText('Terminar ejercicio'));
    expect(screen.onBack).toHaveBeenCalledTimes(1);
  });

  it('removes keyboard listeners on unmount', () => {
    const kb = mockKeyboard();
    const screen = renderForm('reps', 0);
    screen.unmount();
    expect(kb.remove).toHaveBeenCalledTimes(2);
  });
});
