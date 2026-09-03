import { act, render } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import { Text } from 'react-native';

import {
  RecoveryLinkProvider,
  useRecoveryLink,
} from '@/lib/auth/recovery-link-provider';

const mockedAddEventListener = jest.mocked(Linking.addEventListener);
const mockedClearInitialURL = jest.mocked(Linking.clearInitialURL);
const mockedGetLinkingURL = jest.mocked(Linking.getLinkingURL);
let urlListener: ((event: { url: string }) => void) | undefined;

jest.mock('expo-linking', () => ({
  addEventListener: jest.fn((_type, listener) => {
    urlListener = listener;
    return { remove: jest.fn() };
  }),
  clearInitialURL: jest.fn(),
  getLinkingURL: jest.fn(),
}));

function Probe() {
  const { clearRecoveryLink, recoveryUrl } = useRecoveryLink();

  return (
    <>
      <Text testID="url">{recoveryUrl ?? 'none'}</Text>
      <Text
        onPress={() => {
          if (recoveryUrl) {
            clearRecoveryLink(recoveryUrl);
          }
        }}
      >
        clear
      </Text>
    </>
  );
}

describe('RecoveryLinkProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    urlListener = undefined;
    mockedGetLinkingURL.mockReturnValue(
      'keylorforge://auth/recovery#access_token=first&refresh_token=first-refresh&type=recovery',
    );
  });

  it('retains the launch recovery link and a later recovery link while mounted', async () => {
    const view = await render(
      <RecoveryLinkProvider>
        <Probe />
      </RecoveryLinkProvider>,
    );

    expect(mockedAddEventListener).toHaveBeenCalledWith(
      'url',
      expect.any(Function),
    );
    expect(view.getByTestId('url').props.children).toBe(
      'keylorforge://auth/recovery#access_token=first&refresh_token=first-refresh&type=recovery',
    );

    await act(async () => {
      urlListener?.({
        url: 'keylorforge://auth/recovery#access_token=second&refresh_token=second-refresh&type=recovery',
      });
    });

    expect(view.getByTestId('url').props.children).toBe(
      'keylorforge://auth/recovery#access_token=second&refresh_token=second-refresh&type=recovery',
    );
  });

  it('clears a consumed launch link from memory and Expo linking cache', async () => {
    const initialUrl =
      'keylorforge://auth/recovery#access_token=first&refresh_token=first-refresh&type=recovery';
    mockedGetLinkingURL.mockReturnValue(initialUrl);

    const view = await render(
      <RecoveryLinkProvider>
        <Probe />
      </RecoveryLinkProvider>,
    );

    await act(async () => {
      view.getByText('clear').props.onPress();
    });

    expect(view.getByTestId('url').props.children).toBe('none');
    expect(mockedClearInitialURL).toHaveBeenCalledTimes(1);
  });

  it('ignores unrelated incoming links', async () => {
    mockedGetLinkingURL.mockReturnValue(null);

    const view = await render(
      <RecoveryLinkProvider>
        <Probe />
      </RecoveryLinkProvider>,
    );

    await act(async () => {
      urlListener?.({ url: 'keylorforge://profile' });
    });

    expect(view.getByTestId('url').props.children).toBe('none');
  });
});
