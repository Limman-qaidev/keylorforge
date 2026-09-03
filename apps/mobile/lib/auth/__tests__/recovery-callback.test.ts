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
      parseRecoveryCallback('keylorforge://auth/recovery#access_token=token'),
    ).toEqual({ kind: 'invalid' });
  });
});
