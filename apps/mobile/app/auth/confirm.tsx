import { Redirect, useRouter } from 'expo-router';
import { useURL } from 'expo-linking';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { AuthScreen, authScreenStyles } from '@/components/auth/auth-screen';
import { useAuth } from '@/lib/auth/auth-provider';

export default function ConfirmationCallbackRoute() {
  const callbackUrl = useURL();
  const router = useRouter();
  const { consumeConfirmationCallback, phase } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!callbackUrl || phase === 'restoring' || phase === 'signedIn') {
      return;
    }

    let active = true;
    void consumeConfirmationCallback(callbackUrl).then((result) => {
      if (active && result.error) {
        setError(result.error);
      }
    });

    return () => {
      active = false;
    };
  }, [callbackUrl, consumeConfirmationCallback, phase]);

  if (phase === 'signedIn') {
    return <Redirect href="/home" />;
  }

  return (
    <AuthScreen title={error ? 'Confirmation unavailable' : 'Confirming email'}>
      <Text style={authScreenStyles.link}>
        {error ?? 'Finishing your email confirmation…'}
      </Text>
      {error ? (
        <Text
          accessibilityRole="link"
          onPress={() => router.replace('/sign-in')}
          style={authScreenStyles.link}
        >
          Back to sign in
        </Text>
      ) : null}
    </AuthScreen>
  );
}
