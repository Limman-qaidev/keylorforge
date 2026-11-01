import { act, fireEvent, render } from '@testing-library/react-native';
import { Keyboard } from 'react-native';

import { RegisterSetV2 } from '../workout-v2-screens';

type Handler = () => void;

type Subscription = {
  event: string;
  cb: Handler;
  remove: jest.Mock;
};

function mockKeyboard() {
  // One entry per addListener call, each with its own remove(). Effects may
  // run more than once (strict/async test renderer), so never assume a single
  // registration.
  const subscriptions: Subscription[] = [];
  jest
    .spyOn(Keyboard, 'addListener')
    .mockImplementation((event: string, cb: unknown) => {
      const subscription: Subscription = {
        event,
        cb: cb as Handler,
        remove: jest.fn(),
      };
      subscriptions.push(subscription);
      return { remove: subscription.remove } as never;
    });
  const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  const active = () =>
    subscriptions.filter((s) => s.remove.mock.calls.length === 0);
  const emit = (name: 'Show' | 'Hide') =>
    act(() => {
      // Platform.OS is 'ios' under the default jest-expo preset, 'android'
      // otherwise: fire whichever variant is registered and still active.
      active()
        .filter(
          (s) =>
            s.event === `keyboardDid${name}` ||
            s.event === `keyboardWill${name}`,
        )
        .forEach((s) => s.cb());
    });
  return { emit, dismiss, subscriptions, active };
}

const chosen = (measurement_type: 'reps' | 'time' | 'distance') => ({
  id: 'ex-1',
  name: 'Press banca',
  measurement_type,
});

async function renderForm(
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
  const utils = await render(
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
    async (measurement, label) => {
      const kb = mockKeyboard();
      const screen = await renderForm(measurement, 2);
      expect(screen.getByTestId('register-set-footer')).toBeTruthy();

      await fireEvent(screen.getByLabelText(label), 'focus');
      await kb.emit('Show');

      expect(screen.queryByTestId('register-set-footer')).toBeNull();
      expect(screen.getByTestId('register-set-keyboard-bar')).toBeTruthy();
      expect(screen.queryByText('Confirmar otra serie')).toBeNull();

      await fireEvent.press(screen.getByText('Listo'));
      expect(kb.dismiss).toHaveBeenCalledTimes(1);

      await kb.emit('Hide');
      expect(screen.getByTestId('register-set-footer')).toBeTruthy();
      expect(screen.queryByTestId('register-set-keyboard-bar')).toBeNull();
      expect(screen.getByText('Confirmar otra serie')).toBeTruthy();
      expect(screen.getByText('Terminar ejercicio')).toBeTruthy();
    },
  );

  it('restores the footer on blur even if keyboardDidHide never arrives', async () => {
    const kb = mockKeyboard();
    const screen = await renderForm('reps', 1);
    const reps = screen.getByLabelText('Cantidad realizada');
    await fireEvent(reps, 'focus');
    await kb.emit('Show');
    expect(screen.queryByTestId('register-set-footer')).toBeNull();

    await fireEvent(reps, 'blur');
    expect(screen.getByTestId('register-set-footer')).toBeTruthy();
  });

  it('keeps the bar when focus alternates between load and reps', async () => {
    const kb = mockKeyboard();
    const screen = await renderForm('reps', 1);
    const reps = screen.getByLabelText('Cantidad realizada');
    const load = screen.getByLabelText('Carga total opcional');
    await fireEvent(reps, 'focus');
    await kb.emit('Show');
    await act(async () => {
      await fireEvent(reps, 'blur');
      await fireEvent(load, 'focus');
    });
    expect(screen.getByTestId('register-set-keyboard-bar')).toBeTruthy();
    expect(screen.queryByTestId('register-set-footer')).toBeNull();
  });

  it('does not regress CTAs once the keyboard is closed', async () => {
    const kb = mockKeyboard();
    const screen = await renderForm('reps', 1);
    await fireEvent(screen.getByLabelText('Cantidad realizada'), 'focus');
    await kb.emit('Show');
    await kb.emit('Hide');

    await fireEvent.press(screen.getByText('Confirmar otra serie'));
    expect(screen.onConfirm).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Terminar ejercicio'));
    expect(screen.onBack).toHaveBeenCalledTimes(1);
  });

  it('removes keyboard listeners on unmount', async () => {
    const kb = mockKeyboard();
    const screen = await renderForm('reps', 0);
    await screen.unmount();
    expect(kb.subscriptions.length).toBeGreaterThanOrEqual(2);
    kb.subscriptions.forEach((subscription) => {
      expect(subscription.remove).toHaveBeenCalledTimes(1);
    });
    expect(kb.active()).toHaveLength(0);
  });
});
