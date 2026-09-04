import { Redirect, useRouter } from 'expo-router';
import { useLinkingURL } from 'expo-linking';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text } from 'react-native';

import { AuthScreen, authScreenStyles } from '@/components/auth/auth-screen';
import { useAuth } from '@/lib/auth/auth-provider';

export default function SocialAuthCallbackRoute() {
  const callbackUrl = useLinkingURL();
  const router = useRouter();
  const { consumeSocialAuthCallback, phase } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const callbackOperation = useRef<{
    promise: Promise<{ error?: string }>;
    url: string;
  } | null>(null);

  useEffect(() => {
    if (!callbackUrl || phase === 'restoring' || phase === 'signedIn') {
      return;
    }

    let active = true;
    if (callbackOperation.current?.url !== callbackUrl) {
      callbackOperation.current = {
        promise: consumeSocialAuthCallback(callbackUrl),
        url: callbackUrl,
      };
    }

    void callbackOperation.current.promise.then((result) => {
      if (!active) {
        return;
      }

      if (result.error) {
        setError(result.error);
        return;
      }

      router.replace('/home');
    });

    return () => {
      active = false;
    };
  }, [callbackUrl, consumeSocialAuthCallback, phase, router]);

  if (phase === 'signedIn') {
    return <Redirect href="/home" />;
  }

  return (
    <AuthScreen title={error ? 'Sign-in unavailable' : 'Finishing sign in'}>
      <Text style={error ? authScreenStyles.error : authScreenStyles.link}>
        {error ?? 'Securely completing your sign-in…'}
      </Text>
      {error ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/sign-in')}
          style={authScreenStyles.footerAction}
        >
          <Text style={authScreenStyles.footerAccent}>Back to sign in</Text>
        </Pressable>
      ) : null}
    </AuthScreen>
  );
}
