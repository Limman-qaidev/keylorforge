import { normaliseBaseUrl } from '../client';

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
