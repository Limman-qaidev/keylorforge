import { useRouter } from 'expo-router';
import { useLinkingURL } from 'expo-linking';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text } from 'react-native';

import { AuthScreen, authScreenStyles } from '@/components/auth/auth-screen';
import { NewPasswordForm } from '@/components/auth/new-password-form';
import { useAuth } from '@/lib/auth/auth-provider';

export default function RecoveryCallbackRoute() {
  const callbackUrl = useLinkingURL();
  const router = useRouter();
  const { consumeRecoveryCallback, phase, updateRecoveryPassword } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const callbackOperation = useRef<{
    promise: Promise<{ error?: string }>;
    url: string;
  } | null>(null);

  useEffect(() => {
    if (!callbackUrl || phase === 'recovery') {
      return;
    }

    let active = true;
    if (callbackOperation.current?.url !== callbackUrl) {
      callbackOperation.current = {
        promise: consumeRecoveryCallback(callbackUrl),
        url: callbackUrl,
      };
    }

    void callbackOperation.current.promise.then((result) => {
      if (active && result.error) {
        setError(result.error);
      }
    });

    return () => {
      active = false;
    };
  }, [callbackUrl, consumeRecoveryCallback, phase]);

  const updatePassword = async (password: string) => {
    const result = await updateRecoveryPassword(password);
    if (!result.error) {
      router.replace({
        params: { passwordUpdated: 'true' },
        pathname: '/sign-in',
      });
    }
    return result;
  };

  const returnToRequest = () => router.replace('/password-recovery');

  if (phase === 'recovery') {
    return (
      <AuthScreen
        subtitle="Choose a new password for your account."
        title="Set new password"
      >
        <NewPasswordForm onSubmit={updatePassword} />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title={error ? 'Recovery unavailable' : 'Opening recovery'}>
      <Text style={authScreenStyles.link}>
        {error ?? 'Validating your recovery link…'}
      </Text>
      {error ? (
        <Pressable
          accessibilityRole="button"
          onPress={returnToRequest}
          style={authScreenStyles.footerAction}
        >
          <Text style={authScreenStyles.footerText}>
            Request a new recovery email
          </Text>
        </Pressable>
      ) : null}
    </AuthScreen>
  );
}
