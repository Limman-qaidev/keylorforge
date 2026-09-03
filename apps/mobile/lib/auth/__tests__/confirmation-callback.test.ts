import {
  CONFIRMATION_CALLBACK_URL,
  parseConfirmationCallback,
} from '../confirmation-callback';

describe('confirmation callback parsing', () => {
  it('accepts only the configured KeylorFit confirmation endpoint', () => {
    expect(CONFIRMATION_CALLBACK_URL).toBe('keylorfit://auth/confirm');
    expect(
      parseConfirmationCallback(
        'keylorfit://auth/recovery#access_token=access-token&refresh_token=refresh-token',
      ),
    ).toEqual({ kind: 'invalid' });
  });

  it('maps provider callback errors to a safe category without provider text', () => {
    expect(
      parseConfirmationCallback(
        'keylorfit://auth/confirm#error=access_denied&error_description=Token%20expired',
      ),
    ).toEqual({ kind: 'providerError' });
  });
});
