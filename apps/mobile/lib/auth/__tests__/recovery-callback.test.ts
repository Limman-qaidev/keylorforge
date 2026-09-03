import {
  parseRecoveryCallback,
  RECOVERY_CALLBACK_URL,
} from '../recovery-callback';

describe('recovery callback parsing', () => {
  it('accepts only the configured KeylorForge recovery endpoint', () => {
    expect(RECOVERY_CALLBACK_URL).toBe('keylorforge://auth/recovery');
    expect(
      parseRecoveryCallback(
        'keylorforge://auth/confirm#access_token=access-token&refresh_token=refresh-token',
      ),
    ).toEqual({ kind: 'invalid' });
    expect(
      parseRecoveryCallback(
        'keylorforge://auth/recovery#access_token=access-token&refresh_token=refresh-token&type=recovery',
      ),
    ).toEqual({
      accessToken: 'access-token',
      kind: 'session',
      refreshToken: 'refresh-token',
    });
  });

  it('does not surface provider callback error details', () => {
    expect(
      parseRecoveryCallback(
        'keylorforge://auth/recovery#error=access_denied&error_description=Token%20expired',
      ),
    ).toEqual({ kind: 'providerError' });
  });

  it('requires both credentials from the callback fragment', () => {
    expect(
      parseRecoveryCallback(
        'keylorforge://auth/recovery#access_token=token&type=recovery',
      ),
    ).toEqual({ kind: 'invalid' });
  });

  it.each(['confirm', 'magiclink', null])(
    'rejects a tokenized non-recovery callback type: %s',
    (type) => {
      const typeParameter = type ? `&type=${type}` : '';

      expect(
        parseRecoveryCallback(
          `keylorforge://auth/recovery#access_token=access-token&refresh_token=refresh-token${typeParameter}`,
        ),
      ).toEqual({ kind: 'invalid' });
    },
  );
});
