import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import ConfirmationCallbackRoute from '../confirm';
import { useAuth } from '@/lib/auth/auth-provider';
import { useLinkingURL } from 'expo-linking';

const mockReplace = jest.fn();
const consumeConfirmationCallback = jest.fn();
const clearConfirmation = jest.fn();
const mockedUseAuth = jest.mocked(useAuth);
const mockedUseLinkingURL = jest.mocked(useLinkingURL);

jest.mock('expo-linking', () => ({ useLinkingURL: jest.fn() }));

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');

    return <Text testID="redirect">{href}</Text>;
  },
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('@/lib/auth/auth-provider', () => ({ useAuth: jest.fn() }));

function deferredResult() {
  let resolve: (value: { error?: string }) => void;
  const promise = new Promise<{ error?: string }>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve: resolve! };
}

describe('ConfirmationCallbackRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseLinkingURL.mockReturnValue(
      'keylorfit://auth/confirm#access_token=access-token&refresh_token=refresh-token',
    );
    clearConfirmation.mockResolvedValue(undefined);
  });

  it('keeps one callback operation and renders its failure after auth phase changes', async () => {
    const callback = deferredResult();
    let phase: 'restoring' | 'signedOut' = 'signedOut';
    consumeConfirmationCallback.mockReturnValue(callback.promise);
    mockedUseAuth.mockImplementation(
      () =>
        ({
          clearConfirmation,
          consumeConfirmationCallback,
          phase,
        }) as unknown as ReturnType<typeof useAuth>,
    );

    const view = await render(<ConfirmationCallbackRoute />);
    await waitFor(() => {
      expect(consumeConfirmationCallback).toHaveBeenCalledTimes(1);
    });

    phase = 'restoring';
    await view.rerender(<ConfirmationCallbackRoute />);
    phase = 'signedOut';
    await view.rerender(<ConfirmationCallbackRoute />);

    await act(async () => {
      callback.resolve({
        error:
          'This confirmation link is no longer valid. Request a new confirmation email and try again.',
      });
    });

    expect(consumeConfirmationCallback).toHaveBeenCalledTimes(1);
    expect(
      await view.findByText(
        'This confirmation link is no longer valid. Request a new confirmation email and try again.',
      ),
    ).toBeTruthy();

    fireEvent.press(view.getByText('Back to sign in'));
    await waitFor(() => {
      expect(clearConfirmation).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/sign-in');
    });
    expect(view.queryByTestId('redirect')).toBeNull();
  });

  it('consumes a callback delivered while the app is already open', async () => {
    let phase: 'signedOut' = 'signedOut';
    mockedUseLinkingURL.mockReturnValue(null);
    consumeConfirmationCallback.mockResolvedValue({});
    mockedUseAuth.mockImplementation(
      () =>
        ({
          clearConfirmation,
          consumeConfirmationCallback,
          phase,
        }) as unknown as ReturnType<typeof useAuth>,
    );

    const view = await render(<ConfirmationCallbackRoute />);
    expect(consumeConfirmationCallback).not.toHaveBeenCalled();

    mockedUseLinkingURL.mockReturnValue(
      'keylorfit://auth/confirm#access_token=access-token&refresh_token=refresh-token',
    );
    await view.rerender(<ConfirmationCallbackRoute />);

    await waitFor(() => {
      expect(consumeConfirmationCallback).toHaveBeenCalledTimes(1);
    });
  });
});
