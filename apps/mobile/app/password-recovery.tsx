import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';

import { RequireSignedOut } from '@/components/auth/auth-guards';
import { AuthScreen, authScreenStyles } from '@/components/auth/auth-screen';
import { NewPasswordForm } from '@/components/auth/new-password-form';
import { RecoveryCodeForm } from '@/components/auth/recovery-code-form';
import { RecoveryRequestForm } from '@/components/auth/recovery-request-form';
import { PasswordRecoveryController } from '@/lib/auth/password-recovery';

type RecoveryStage = 'request' | 'code' | 'password';

function PasswordRecoveryScreen() {
  const router = useRouter();
  const [controller] = useState(() => new PasswordRecoveryController());
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<RecoveryStage>('request');

  useEffect(
    () => () => {
      void controller.cancel();
    },
    [controller],
  );

  const requestCode = async (nextEmail: string) => {
    const result = await controller.requestCode(nextEmail);
    if (!result.error) {
      setEmail(nextEmail);
      setStage('code');
    }
    return result;
  };

  const verifyCode = async (code: string) => {
    const result = await controller.verifyCode(email, code);
    if (!result.error) {
      setStage('password');
    }
    return result;
  };

  const updatePassword = async (password: string) => {
    const result = await controller.updatePassword(password);
    if (!result.error) {
      router.replace({
        params: { passwordUpdated: 'true' },
        pathname: '/sign-in',
      });
    }
    return result;
  };

  const cancelRecovery = async () => {
    await controller.cancel();
    router.replace('/sign-in');
  };

  const restartRecovery = async () => {
    await controller.cancel();
    setEmail('');
    setStage('request');
  };

  if (stage === 'code') {
    return (
      <AuthScreen
        subtitle="Enter the 6-digit code from the recovery email."
        title="Check your email"
      >
        <Text accessibilityRole="alert" style={authScreenStyles.success}>
          If an account matches that email address, we sent a recovery code.
        </Text>
        <RecoveryCodeForm onSubmit={verifyCode} />
        <Pressable
          accessibilityRole="button"
          onPress={() => void restartRecovery()}
          style={authScreenStyles.footerAction}
        >
          <Text style={authScreenStyles.footerText}>Use a different email</Text>
        </Pressable>
      </AuthScreen>
    );
  }

  if (stage === 'password') {
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
    <AuthScreen
      subtitle="We'll email a 6-digit code. No link needs to open the app."
      title="Reset your password"
    >
      <RecoveryRequestForm onSubmit={requestCode} />
      <Pressable
        accessibilityRole="button"
        onPress={() => void cancelRecovery()}
        style={authScreenStyles.footerAction}
      >
        <Text style={authScreenStyles.footerText}>Back to sign in</Text>
      </Pressable>
    </AuthScreen>
  );
}

export default function PasswordRecoveryRoute() {
  return (
    <RequireSignedOut>
      <PasswordRecoveryScreen />
    </RequireSignedOut>
  );
}
