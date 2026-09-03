import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text } from 'react-native';

import { AuthScreen, authScreenStyles } from '@/components/auth/auth-screen';
import { NewPasswordForm } from '@/components/auth/new-password-form';
import { useAuth } from '@/lib/auth/auth-provider';
import { useRecoveryLink } from '@/lib/auth/recovery-link-provider';

export default function RecoveryCallbackRoute() {
  const router = useRouter();
  const {
    consumeRecoveryCallback,
    invalidateSession,
    phase,
    updateRecoveryPassword,
  } = useAuth();
  const { clearRecoveryLink, recoveryUrl } = useRecoveryLink();
  const [error, setError] = useState<string | null>(null);
  const callbackOperation = useRef<{
    promise: Promise<{ error?: string }>;
    url: string;
  } | null>(null);

  useEffect(() => {
    if (!recoveryUrl || phase === 'recovery') {
      return;
    }

    let active = true;
    if (callbackOperation.current?.url !== recoveryUrl) {
      setError(null);
      callbackOperation.current = {
        promise: consumeRecoveryCallback(recoveryUrl),
        url: recoveryUrl,
      };
    }

    const operation = callbackOperation.current;
    void operation.promise.then((result) => {
      clearRecoveryLink(operation.url);
      if (active && result.error) {
        setError(result.error);
      }
    });

    return () => {
      active = false;
    };
  }, [clearRecoveryLink, consumeRecoveryCallback, phase, recoveryUrl]);

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

  const cancelRecovery = async () => {
    await invalidateSession();
    router.replace('/sign-in');
  };

  const returnToRequest = () => router.replace('/password-recovery');

  if (phase === 'recovery') {
    return (
      <AuthScreen
        subtitle="Choose a new password for your account."
        title="Set new password"
      >
        <NewPasswordForm onSubmit={updatePassword} />
        <Pressable
          accessibilityRole="button"
          onPress={() => void cancelRecovery()}
          style={authScreenStyles.footerAction}
        >
          <Text style={authScreenStyles.footerText}>
            Cancel recovery and return to sign in
          </Text>
        </Pressable>
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
