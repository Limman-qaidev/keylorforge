const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

function normaliseBaseUrl(value: string): string {
  const url = new URL(value);

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL must use HTTP or HTTPS.');
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
