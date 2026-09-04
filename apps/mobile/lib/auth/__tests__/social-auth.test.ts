import type { Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';

import {
  authenticateWithSocialProvider,
  getSocialAuthCapabilities,
  SOCIAL_AUTH_CALLBACK_URL,
  SOCIAL_AUTH_ERROR_MESSAGE,
} from '../social-auth';
import type { MobileSupabaseClient } from '../supabase';

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));

const originalAppleAuthFlag = process.env.EXPO_PUBLIC_APPLE_AUTH_ENABLED;
const originalGoogleAuthFlag = process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED;

function installedSession(): Session {
  return {
    access_token: 'installed-access-token',
    refresh_token: 'installed-refresh-token',
  } as unknown as Session;
}

function createClient({
  oauthError = null,
  oauthUrl = 'https://project.supabase.co/auth/v1/authorize?provider=example',
  sessionError = null,
}: {
  oauthError?: Error | null;
  oauthUrl?: string | null;
  sessionError?: Error | null;
} = {}) {
  return {
    auth: {
      setSession: jest.fn().mockResolvedValue({
        data: { session: sessionError ? null : installedSession() },
        error: sessionError,
      }),
      signInWithOAuth: jest.fn().mockResolvedValue({
        data: { url: oauthError ? null : oauthUrl },
        error: oauthError,
      }),
    },
  } as unknown as MobileSupabaseClient;
}

function browserResult(
  value:
    | { type: 'cancel' | 'dismiss' }
    | { type: 'success'; url: string },
): Awaited<ReturnType<typeof WebBrowser.openAuthSessionAsync>> {
  return value as Awaited<ReturnType<typeof WebBrowser.openAuthSessionAsync>>;
}

beforeEach(() => {
  delete process.env.EXPO_PUBLIC_APPLE_AUTH_ENABLED;
  delete process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED;
  jest.mocked(WebBrowser.openAuthSessionAsync).mockReset();
});

afterAll(() => {
  if (originalAppleAuthFlag === undefined) {
    delete process.env.EXPO_PUBLIC_APPLE_AUTH_ENABLED;
  } else {
    process.env.EXPO_PUBLIC_APPLE_AUTH_ENABLED = originalAppleAuthFlag;
  }

  if (originalGoogleAuthFlag === undefined) {
    delete process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED;
  } else {
    process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED = originalGoogleAuthFlag;
  }
});

describe('social auth', () => {
  it('defaults both provider capabilities to unavailable', () => {
    expect(getSocialAuthCapabilities()).toEqual({ apple: false, google: false });
  });

  it('only enables provider capabilities explicitly set to true', () => {
    process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED = 'true';
    process.env.EXPO_PUBLIC_APPLE_AUTH_ENABLED = 'TRUE';

    expect(getSocialAuthCapabilities()).toEqual({ apple: true, google: true });
  });

  it.each(['google', 'apple'] as const)(
    'starts %s OAuth with the accepted callback and no browser redirect',
    async (provider) => {
      const client = createClient();
      jest
        .mocked(WebBrowser.openAuthSessionAsync)
        .mockResolvedValue(browserResult({ type: 'cancel' }));

      await authenticateWithSocialProvider(client, provider);

      expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider,
        options: {
          redirectTo: SOCIAL_AUTH_CALLBACK_URL,
          skipBrowserRedirect: true,
        },
      });
      expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
        'https://project.supabase.co/auth/v1/authorize?provider=example',
        SOCIAL_AUTH_CALLBACK_URL,
      );
    },
  );

  it.each(['cancel', 'dismiss'] as const)(
    'treats browser %s as a safe cancellation without installing a session',
    async (type) => {
      const client = createClient();
      jest
        .mocked(WebBrowser.openAuthSessionAsync)
        .mockResolvedValue(browserResult({ type }));

      await expect(
        authenticateWithSocialProvider(client, 'google'),
      ).resolves.toEqual({ status: 'cancelled' });
      expect(client.auth.setSession).not.toHaveBeenCalled();
    },
  );

  it('sanitizes provider initiation failures', async () => {
    const client = createClient({
      oauthError: new Error('provider secret detail: authorization_code=abc'),
    });

    await expect(
      authenticateWithSocialProvider(client, 'google'),
    ).resolves.toEqual({
      message: SOCIAL_AUTH_ERROR_MESSAGE,
      status: 'error',
    });
    expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
  });

  it('fails safely when Supabase returns no OAuth URL', async () => {
    const client = createClient({ oauthUrl: null });

    await expect(
      authenticateWithSocialProvider(client, 'google'),
    ).resolves.toEqual({
      message: SOCIAL_AUTH_ERROR_MESSAGE,
      status: 'error',
    });
    expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
  });

  it('fails closed for a malformed or unexpected callback URL', async () => {
    const client = createClient();
    jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue(
      browserResult({
        type: 'success',
        url: 'keylorforge://auth/not-oauth#access_token=a&refresh_token=b',
      }),
    );

    await expect(
      authenticateWithSocialProvider(client, 'google'),
    ).resolves.toEqual({
      message: SOCIAL_AUTH_ERROR_MESSAGE,
      status: 'error',
    });
    expect(client.auth.setSession).not.toHaveBeenCalled();
  });

  it.each([
    'keylorforge://auth/oauth#access_token=only-access',
    'keylorforge://auth/oauth#refresh_token=only-refresh',
  ])('fails closed when a callback token is missing', async (callbackUrl) => {
    const client = createClient();
    jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue(
      browserResult({ type: 'success', url: callbackUrl }),
    );

    await expect(
      authenticateWithSocialProvider(client, 'google'),
    ).resolves.toEqual({
      message: SOCIAL_AUTH_ERROR_MESSAGE,
      status: 'error',
    });
    expect(client.auth.setSession).not.toHaveBeenCalled();
  });

  it('sanitizes an OAuth callback provider error', async () => {
    const client = createClient();
    jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue(
      browserResult({
        type: 'success',
        url: 'keylorforge://auth/oauth#error=access_denied&error_description=sensitive-provider-detail',
      }),
    );

    const result = await authenticateWithSocialProvider(client, 'apple');

    expect(result).toEqual({
      message: SOCIAL_AUTH_ERROR_MESSAGE,
      status: 'error',
    });
    expect(JSON.stringify(result)).not.toContain('sensitive-provider-detail');
    expect(client.auth.setSession).not.toHaveBeenCalled();
  });

  it.each([
    'keylorforge://auth/oauth?access_token=query-access&refresh_token=query-refresh',
    'keylorforge://auth/oauth#access_token=hash-access&refresh_token=hash-refresh',
  ])('installs a successful query/hash callback through setSession', async (url) => {
    const client = createClient();
    jest
      .mocked(WebBrowser.openAuthSessionAsync)
      .mockResolvedValue(browserResult({ type: 'success', url }));

    await expect(
      authenticateWithSocialProvider(client, 'google'),
    ).resolves.toEqual({ session: installedSession(), status: 'success' });

    const expectedAccessToken = url.includes('query-access')
      ? 'query-access'
      : 'hash-access';
    const expectedRefreshToken = url.includes('query-refresh')
      ? 'query-refresh'
      : 'hash-refresh';
    expect(client.auth.setSession).toHaveBeenCalledWith({
      access_token: expectedAccessToken,
      refresh_token: expectedRefreshToken,
    });
  });

  it('sanitizes Supabase setSession failures', async () => {
    const client = createClient({
      sessionError: new Error('refresh-token leaked provider detail'),
    });
    jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue(
      browserResult({
        type: 'success',
        url: 'keylorforge://auth/oauth#access_token=a&refresh_token=b',
      }),
    );

    const result = await authenticateWithSocialProvider(client, 'google');

    expect(result).toEqual({
      message: SOCIAL_AUTH_ERROR_MESSAGE,
      status: 'error',
    });
    expect(JSON.stringify(result)).not.toContain('refresh-token leaked');
  });

  it('sanitizes browser/network exceptions', async () => {
    const client = createClient();
    jest
      .mocked(WebBrowser.openAuthSessionAsync)
      .mockRejectedValue(new Error('network detail with authorization code'));

    await expect(
      authenticateWithSocialProvider(client, 'google'),
    ).resolves.toEqual({
      message: SOCIAL_AUTH_ERROR_MESSAGE,
      status: 'error',
    });
    expect(client.auth.setSession).not.toHaveBeenCalled();
  });
});
