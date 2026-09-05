import 'react-native-url-polyfill/auto';

import type { Session } from '@supabase/supabase-js';

import type { MobileSupabaseClient } from '@/lib/auth/supabase';

export const SOCIAL_AUTH_CALLBACK_URL = 'keylorforge://auth/oauth';
export const SOCIAL_AUTH_ERROR_MESSAGE =
  'Social sign-in could not be completed. Please try again.';

export type SocialAuthProvider = 'apple' | 'google';

export type SocialAuthCapabilities = Record<SocialAuthProvider, boolean>;

type SocialAuthResult =
  | { status: 'cancelled' }
  | { message: string; status: 'error' }
  | { session: Session; status: 'success' };

type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

function isExplicitlyEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export function getSocialAuthCapabilities(): SocialAuthCapabilities {
  return {
    apple: isExplicitlyEnabled(process.env.EXPO_PUBLIC_APPLE_AUTH_ENABLED),
    google: isExplicitlyEnabled(process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED),
  };
}

/**
 * Both typed providers are implemented by the M1 client. Runtime capability
 * flags intentionally do not authorize this action; they only control whether
 * provider buttons are presented by the UI.
 */
export function isSocialAuthProviderEnabled(
  provider: SocialAuthProvider,
): boolean {
  return provider === 'apple' || provider === 'google';
}

function readUnambiguousParameter(
  name: string,
  ...sources: URLSearchParams[]
): string | null {
  const values = sources
    .flatMap((source) => source.getAll(name))
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.length === 0) {
    return null;
  }

  const firstValue = values[0];
  if (!firstValue) {
    return null;
  }

  return values.every((value) => value === firstValue) ? firstValue : null;
}

function parseCallbackTokenPair(url: string): TokenPair | null {
  try {
    const parsedUrl = new URL(url);
    if (
      parsedUrl.protocol !== 'keylorforge:' ||
      parsedUrl.hostname !== 'auth' ||
      parsedUrl.pathname !== '/oauth'
    ) {
      return null;
    }

    const queryParameters = parsedUrl.searchParams;
    const hashParameters = new URLSearchParams(
      parsedUrl.hash.startsWith('#') ? parsedUrl.hash.slice(1) : parsedUrl.hash,
    );
    const parameterSources = [queryParameters, hashParameters];

    const hasProviderError = ['error', 'error_code', 'error_description'].some(
      (name) =>
        parameterSources.some((parameters) => Boolean(parameters.get(name))),
    );
    if (hasProviderError) {
      return null;
    }

    const accessToken = readUnambiguousParameter(
      'access_token',
      ...parameterSources,
    );
    const refreshToken = readUnambiguousParameter(
      'refresh_token',
      ...parameterSources,
    );
    if (!accessToken || !refreshToken) {
      return null;
    }

    return { accessToken, refreshToken };
  } catch {
    return null;
  }
}

export async function authenticateWithSocialProvider(
  client: MobileSupabaseClient,
  provider: SocialAuthProvider,
): Promise<SocialAuthResult> {
  try {
    const { data, error } = await client.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: SOCIAL_AUTH_CALLBACK_URL,
        skipBrowserRedirect: true,
      },
    });
    if (error || !data.url) {
      return { message: SOCIAL_AUTH_ERROR_MESSAGE, status: 'error' };
    }

    // Social auth is currently muted in the UI. Keep the native browser module
    // lazy so existing development builds that predate expo-web-browser can
    // still run the rest of the app without requiring a native rebuild.
    const WebBrowser = await import('expo-web-browser');
    const browserResult = await WebBrowser.openAuthSessionAsync(
      data.url,
      SOCIAL_AUTH_CALLBACK_URL,
    );
    if (browserResult.type === 'cancel' || browserResult.type === 'dismiss') {
      return { status: 'cancelled' };
    }

    if (browserResult.type !== 'success') {
      return { message: SOCIAL_AUTH_ERROR_MESSAGE, status: 'error' };
    }

    const tokenPair = parseCallbackTokenPair(browserResult.url);
    if (!tokenPair) {
      return { message: SOCIAL_AUTH_ERROR_MESSAGE, status: 'error' };
    }

    const { data: sessionData, error: sessionError } =
      await client.auth.setSession({
        access_token: tokenPair.accessToken,
        refresh_token: tokenPair.refreshToken,
      });
    if (sessionError || !sessionData.session) {
      return { message: SOCIAL_AUTH_ERROR_MESSAGE, status: 'error' };
    }

    return { session: sessionData.session, status: 'success' };
  } catch {
    return { message: SOCIAL_AUTH_ERROR_MESSAGE, status: 'error' };
  }
}
