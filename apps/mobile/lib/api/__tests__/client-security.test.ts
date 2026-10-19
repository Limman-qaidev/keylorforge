import { isAuthorizedQaLoopback, normaliseBaseUrl } from '../client';

describe('protected API URL configuration', () => {
  it.each([
    'http://example.org:8001',
    'http://192.168.1.22:8001',
    'http://127.0.0.1:8001',
  ])('rejects plaintext bearer transport in production: %s', (url) => {
    expect(() => normaliseBaseUrl(url, false)).toThrow(
      'EXPO_PUBLIC_API_BASE_URL must use HTTPS in production.',
    );
  });

  it('keeps ADB reverse and developer LAN APIs available in development', () => {
    expect(normaliseBaseUrl('http://127.0.0.1:8001', true)).toBe(
      'http://127.0.0.1:8001',
    );
    expect(normaliseBaseUrl('http://192.168.1.22:8001', true)).toBe(
      'http://192.168.1.22:8001',
    );
  });

  it('accepts HTTPS in production while rejecting credential-bearing URLs', () => {
    expect(normaliseBaseUrl('https://api.example.org/', false)).toBe(
      'https://api.example.org',
    );
    expect(() =>
      normaliseBaseUrl('https://user:pass@api.example.org', false),
    ).toThrow('must not contain credentials');
    expect(() => normaliseBaseUrl('file:///etc/passwd', true)).toThrow(
      'must use HTTP or HTTPS',
    );
  });
});

describe('Android QA release loopback exception', () => {
  const packageId = 'com.jonathansalgadonieto.keylorforge.qareal';
  const url = 'http://127.0.0.1:8001';

  it('authorizes only an exact QA package, manifest flag and ADB loopback', () => {
    expect(isAuthorizedQaLoopback(url, packageId, true, 'android')).toBe(true);
    for (const candidate of [
      ['http://192.168.1.22:8001', packageId, true, 'android'],
      ['http://127.0.0.1:8000', packageId, true, 'android'],
      ['https://evil.test', packageId, true, 'android'],
      [url, 'com.jonathansalgadonieto.keylorforge', true, 'android'],
      [url, packageId, false, 'android'],
      [url, packageId, true, 'ios'],
    ] as const) {
      expect(isAuthorizedQaLoopback(...candidate)).toBe(false);
    }
  });

  it('retains HTTPS enforcement outside the exact QA exception', () => {
    expect(() => normaliseBaseUrl(url, false)).toThrow('HTTPS in production');
    expect(
      normaliseBaseUrl(
        url,
        isAuthorizedQaLoopback(url, packageId, true, 'android'),
      ),
    ).toBe(url);
  });
});
