import 'react-native-url-polyfill/auto';

import * as Linking from 'expo-linking';
import type { Session } from '@supabase/supabase-js';

import type { MobileSupabaseClient } from '@/lib/auth/supabase';

export type SocialAuthProvider = 'apple' | 'google';

export type SocialAuthCapabilities = Record<SocialAuthProvider, boolean>;

export const SOCIAL_AUTH_CALLBACK_URL = 'keylorforge://auth/oauth';

const SOCIAL_AUTH_ERROR =
  'Social sign-in could not be completed. Please try again.';
const SOCIAL_AUTH_UNAVAILABLE = 'This sign-in option is not available.';

type SocialAuthActionResult = { error: string } | { error?: undefined };

type SocialAuthSessionResult =
  | { cancelled: true; error?: undefined; session?: undefined }
  | { error: string; cancelled?: undefined; session?: undefined }
  | { error?: undefined; cancelled?: undefined; session: Session };

type SocialAuthCallback =
  | { kind: 'cancelled' }
  | { kind: 'invalid' }
  | { kind: 'providerError' }
  | { accessToken: string; kind: 'success'; refreshToken: string };

type OpenUrl = (url: string) => Promise<unknown>;

function enabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export function getSocialAuthCapabilities(): SocialAuthCapabilities {
  return {
    apple: enabled(process.env.EXPO_PUBLIC_APPLE_AUTH_ENABLED),
    google: enabled(process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED),
  };
}

export function socialAuthUnavailableResult(): SocialAuthActionResult {
  return { error: SOCIAL_AUTH_UNAVAILABLE };
}

function callbackParameters(url: URL): URLSearchParams {
  const parameters = new URLSearchParams(url.search);
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  const hashParameters = new URLSearchParams(hash);

  hashParameters.forEach((value, key) => {
    if (!parameters.has(key)) {
      parameters.set(key, value);
    }
  });

  return parameters;
}

export function parseSocialAuthCallback(url: string): SocialAuthCallback {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { kind: 'invalid' };
  }

  if (
    parsedUrl.protocol !== 'keylorforge:' ||
    parsedUrl.hostname !== 'auth' ||
    parsedUrl.pathname !== '/oauth'
  ) {
    return { kind: 'invalid' };
  }

  const parameters = callbackParameters(parsedUrl);
  const providerError = parameters.get('error');
  if (
    providerError === 'access_denied' ||
    (providerError?.toLowerCase().includes('cancel') ?? false)
  ) {
    return { kind: 'cancelled' };
  }

  if (
    providerError ||
    parameters.has('error_code') ||
    parameters.has('error_description')
  ) {
    return { kind: 'providerError' };
  }

  const accessToken = parameters.get('access_token');
  const refreshToken = parameters.get('refresh_token');
  if (!accessToken || !refreshToken) {
    return { kind: 'invalid' };
  }

  return { accessToken, kind: 'success', refreshToken };
}

export async function beginSocialAuth(
  client: MobileSupabaseClient,
  provider: SocialAuthProvider,
  openUrl: OpenUrl = Linking.openURL,
): Promise<SocialAuthActionResult> {
  try {
    const { data, error } = await client.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: SOCIAL_AUTH_CALLBACK_URL,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data.url) {
      return { error: SOCIAL_AUTH_ERROR };
    }

    await openUrl(data.url);
    return {};
  } catch {
    return { error: SOCIAL_AUTH_ERROR };
  }
}

export async function installSocialAuthSession(
  client: MobileSupabaseClient,
  callbackUrl: string,
): Promise<SocialAuthSessionResult> {
  const callback = parseSocialAuthCallback(callbackUrl);
  if (callback.kind === 'cancelled') {
    return { cancelled: true };
  }
  if (callback.kind !== 'success') {
    return { error: SOCIAL_AUTH_ERROR };
  }

  try {
    const { data, error } = await client.auth.setSession({
      access_token: callback.accessToken,
      refresh_token: callback.refreshToken,
    });

    if (error || !data.session) {
      return { error: SOCIAL_AUTH_ERROR };
    }

    return { session: data.session };
  } catch {
    return { error: SOCIAL_AUTH_ERROR };
  }
}
