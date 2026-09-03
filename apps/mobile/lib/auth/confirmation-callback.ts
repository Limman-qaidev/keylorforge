import 'react-native-url-polyfill/auto';

export const CONFIRMATION_CALLBACK_URL = 'keylorforge://auth/confirm';

type ConfirmationCallback =
  | { kind: 'providerError' }
  | {
      accessToken: string;
      kind: 'session';
      refreshToken: string;
    }
  | { kind: 'invalid' };

/**
 * Reads only the implicit-flow session fields expected at the KeylorForge
 * confirmation callback. The callback itself is never surfaced in UI or logs.
 */
export function parseConfirmationCallback(url: string): ConfirmationCallback {
  try {
    const callback = new URL(url);
    if (
      callback.protocol !== 'keylorforge:' ||
      callback.hostname !== 'auth' ||
      callback.pathname !== '/confirm'
    ) {
      return { kind: 'invalid' };
    }

    const parameters = new URLSearchParams(callback.hash.slice(1));
    if (parameters.has('error') || parameters.has('error_code')) {
      return { kind: 'providerError' };
    }

    const accessToken = parameters.get('access_token');
    const refreshToken = parameters.get('refresh_token');
    if (!accessToken || !refreshToken) {
      return { kind: 'invalid' };
    }

    return { accessToken, kind: 'session', refreshToken };
  } catch {
    return { kind: 'invalid' };
  }
}
