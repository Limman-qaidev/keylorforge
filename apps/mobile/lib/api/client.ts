import Constants from 'expo-constants';
import { Platform } from 'react-native';

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const QA_LOCAL_URL = 'http://127.0.0.1:8001';
const QA_ANDROID_PACKAGE = 'com.jonathansalgadonieto.keylorforge.qareal';

/** QA may use ADB reverse, but no non-QA release may send bearer tokens over HTTP. */
export function isAuthorizedQaLoopback(
  url: string,
  packageId: string | undefined,
  qaEnabled: boolean,
  platform: string,
): boolean {
  return (
    platform === 'android' &&
    packageId === QA_ANDROID_PACKAGE &&
    qaEnabled === true &&
    url === QA_LOCAL_URL
  );
}

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
  if (!apiBaseUrl) return undefined;
  const qaLoopback = isAuthorizedQaLoopback(
    apiBaseUrl,
    Constants.expoConfig?.android?.package,
    Constants.expoConfig?.extra?.m3RealQaWorkoutEnabled === true,
    Platform.OS,
  );
  return normaliseBaseUrl(apiBaseUrl, __DEV__ || qaLoopback);
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
