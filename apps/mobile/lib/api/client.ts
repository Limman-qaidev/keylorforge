const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

/**
 * Protected workout transports include bearer tokens. Production must never
 * send them over plaintext HTTP. DEV still supports LAN/ADB loopback test APIs.
 */
export function normaliseBaseUrl(
  value: string,
  isDevelopment: boolean = __DEV__,
): string {
  const url = new URL(value);

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL must use HTTP or HTTPS.');
  }
  if (url.protocol === 'http:' && !isDevelopment) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL must use HTTPS in production.');
  }
  if (url.username || url.password) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL must not contain credentials.');
  }

  return url.toString().replace(/\/$/, '');
}

export function getApiBaseUrl(): string | undefined {
  return apiBaseUrl ? normaliseBaseUrl(apiBaseUrl) : undefined;
}

/**
 * Creates a request against the configured API base URL.
 *
 * This transport intentionally has no product endpoints or response contracts.
 * Feature modules will provide those only after server OpenAPI contracts exist.
 */
export async function requestApi(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const baseUrl = getApiBaseUrl();

  if (!baseUrl) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is not configured.');
  }

  const url = new URL(path.replace(/^\//, ''), `${baseUrl}/`);
  return fetch(url, init);
}
