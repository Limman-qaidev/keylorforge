import {
  CONFIRMATION_CALLBACK_URL,
  parseConfirmationCallback,
} from '../confirmation-callback';

describe('confirmation callback parsing', () => {
  it.each([
    'keylorforge://auth/confirm#access_token=a&access_token=b&refresh_token=r',
    'keylorforge://auth/confirm#access_token=a&refresh_token=r&refresh_token=r',
    'keylorforge://auth/confirm#access_token=a&refresh_token=r&access_token=a',
    `keylorforge://auth/confirm#access_token=${'x'.repeat(8200)}&refresh_token=r`,
  ])('rejects ambiguous or overlong callback credentials', (url) => {
    expect(parseConfirmationCallback(url)).toEqual({ kind: 'invalid' });
  });

  it('continues accepting one complete session pair', () => {
    expect(
      parseConfirmationCallback(
        'keylorforge://auth/confirm#access_token=a&refresh_token=r',
      ),
    ).toEqual({ accessToken: 'a', refreshToken: 'r', kind: 'session' });
  });

  it('accepts only the configured KeylorForge confirmation endpoint', () => {
    expect(CONFIRMATION_CALLBACK_URL).toBe('keylorforge://auth/confirm');
    expect(
      parseConfirmationCallback(
        'keylorforge://auth/recovery#access_token=access-token&refresh_token=refresh-token',
      ),
    ).toEqual({ kind: 'invalid' });
  });

  it('maps provider callback errors to a safe category without provider text', () => {
    expect(
      parseConfirmationCallback(
        'keylorforge://auth/confirm#error=access_denied&error_description=Token%20expired',
      ),
    ).toEqual({ kind: 'providerError' });
  });
});
