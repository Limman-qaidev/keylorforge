import 'react-native-url-polyfill/auto';

export const RECOVERY_CALLBACK_URL = 'keylorforge://auth/recovery';

export type RecoveryCallback =
  | { kind: 'providerError' }
  | {
      accessToken: string;
      kind: 'session';
      refreshToken: string;
    }
  | { kind: 'invalid' };

/**
 * Reads only the implicit-flow session fields accepted at the recovery endpoint.
 * Callers must never render or log the callback URL or either credential.
 */
export function parseRecoveryCallback(url: string): RecoveryCallback {
  try {
    const callback = new URL(url);
    if (
      callback.protocol !== 'keylorforge:' ||
      callback.hostname !== 'auth' ||
      callback.pathname !== '/recovery'
    ) {
      return { kind: 'invalid' };
    }

    const parameters = new URLSearchParams(callback.hash.slice(1));
    if (parameters.has('error') || parameters.has('error_code')) {
      return { kind: 'providerError' };
    }

    if (parameters.get('type') !== 'recovery') {
      return { kind: 'invalid' };
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
