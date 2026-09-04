import type { Session } from '@supabase/supabase-js';

import {
  beginSocialAuth,
  getSocialAuthCapabilities,
  installSocialAuthSession,
  parseSocialAuthCallback,
  SOCIAL_AUTH_CALLBACK_URL,
} from '../social-auth';
import type { MobileSupabaseClient } from '../supabase';

function session(): Session {
  return {
    access_token: 'installed-access-token',
    expires_at: 1_999_999_999,
    expires_in: 3600,
    refresh_token: 'installed-refresh-token',
    token_type: 'bearer',
    user: {
      app_metadata: {},
      aud: 'authenticated',
      created_at: '2026-09-04T00:00:00.000Z',
      email: 'social@example.com',
      id: 'fa210a8d-54ad-4850-84dd-49f370704ea3',
      user_metadata: {},
    },
  };
}

function client({
  oauthError = null,
  oauthUrl = 'https://project.supabase.co/auth/v1/authorize?provider=google',
  setSessionError = null,
}: {
  oauthError?: Error | null;
  oauthUrl?: string | null;
  setSessionError?: Error | null;
} = {}) {
  return {
    auth: {
      signInWithOAuth: jest.fn().mockResolvedValue({
        data: { provider: 'google', url: oauthUrl },
        error: oauthError,
      }),
      setSession: jest.fn().mockResolvedValue({
        data: { session: setSessionError ? null : session() },
        error: setSessionError,
      }),
    },
  } as unknown as MobileSupabaseClient;
}

describe('social auth', () => {
  const originalGoogle = process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED;
  const originalApple = process.env.EXPO_PUBLIC_APPLE_AUTH_ENABLED;

  afterEach(() => {
    process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED = originalGoogle;
    process.env.EXPO_PUBLIC_APPLE_AUTH_ENABLED = originalApple;
  });

  it('treats provider capability flags as opt-in only', () => {
    process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED = 'true';
    process.env.EXPO_PUBLIC_APPLE_AUTH_ENABLED = 'false';

    expect(getSocialAuthCapabilities()).toEqual({
      apple: false,
      google: true,
    });
  });

  it.each(['google', 'apple'] as const)(
    'starts %s through Supabase and the KeylorForge callback',
    async (provider) => {
      const authClient = client();
      const openUrl = jest.fn().mockResolvedValue(undefined);

      const result = await beginSocialAuth(authClient, provider, openUrl);

      expect(result).toEqual({});
      expect(authClient.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider,
        options: {
          redirectTo: SOCIAL_AUTH_CALLBACK_URL,
          skipBrowserRedirect: true,
        },
      });
      expect(openUrl).toHaveBeenCalledWith(
        'https://project.supabase.co/auth/v1/authorize?provider=google',
      );
    },
  );

  it('sanitizes provider initiation failures', async () => {
    const authClient = client({
      oauthError: new Error('provider secret leaked in raw error'),
    });

    const result = await beginSocialAuth(
      authClient,
      'google',
      jest.fn().mockResolvedValue(undefined),
    );

    expect(result.error).toBe(
      'Social sign-in could not be completed. Please try again.',
    );
    expect(result.error).not.toContain('secret');
  });

  it('rejects callbacks outside the exact KeylorForge social-auth route', () => {
    expect(
      parseSocialAuthCallback(
        'keylorforge://auth/confirm#access_token=a&refresh_token=r',
      ),
    ).toEqual({ kind: 'invalid' });
    expect(
      parseSocialAuthCallback(
        'https://example.com/auth/oauth#access_token=a&refresh_token=r',
      ),
    ).toEqual({ kind: 'invalid' });
  });

  it('fails closed when either Supabase session token is missing', async () => {
    const authClient = client();

    const result = await installSocialAuthSession(
      authClient,
      'keylorforge://auth/oauth#access_token=access-only',
    );

    expect(result.error).toBe(
      'Social sign-in could not be completed. Please try again.',
    );
    expect(authClient.auth.setSession).not.toHaveBeenCalled();
  });

  it('does not surface provider callback error details', async () => {
    const authClient = client();

    const result = await installSocialAuthSession(
      authClient,
      'keylorforge://auth/oauth?error=access_denied&error_description=private-provider-detail',
    );

    expect(result.error).toBe(
      'Social sign-in could not be completed. Please try again.',
    );
    expect(result.error).not.toContain('private-provider-detail');
  });

  it('installs a successful callback through the existing Supabase session store', async () => {
    const authClient = client();

    const result = await installSocialAuthSession(
      authClient,
      'keylorforge://auth/oauth#access_token=callback-access&refresh_token=callback-refresh',
    );

    expect(result.error).toBeUndefined();
    expect(result.session?.access_token).toBe('installed-access-token');
    expect(authClient.auth.setSession).toHaveBeenCalledWith({
      access_token: 'callback-access',
      refresh_token: 'callback-refresh',
    });
  });

  it('sanitizes setSession failures', async () => {
    const authClient = client({
      setSessionError: new Error('refresh_token=should-never-be-shown'),
    });

    const result = await installSocialAuthSession(
      authClient,
      'keylorforge://auth/oauth#access_token=callback-access&refresh_token=callback-refresh',
    );

    expect(result.error).toBe(
      'Social sign-in could not be completed. Please try again.',
    );
    expect(result.error).not.toContain('refresh_token');
  });
});
