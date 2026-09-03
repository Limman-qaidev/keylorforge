import { Link } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { RequireSignedOut } from '@/components/auth/auth-guards';
import { AuthScreen, authScreenStyles } from '@/components/auth/auth-screen';
import { RecoveryRequestForm } from '@/components/auth/recovery-request-form';
import { useAuth } from '@/lib/auth/auth-provider';

function PasswordRecoveryScreen() {
  const { requestPasswordRecovery } = useAuth();

  return (
    <AuthScreen
      backHref="/welcome"
      subtitle="We'll email a secure link to set a new password."
      title="Reset your password"
    >
      <RecoveryRequestForm onSubmit={requestPasswordRecovery} />
      <Link asChild href="/sign-in">
        <Pressable
          accessibilityRole="link"
          style={authScreenStyles.footerAction}
        >
          <Text style={authScreenStyles.footerText}>
            Remembered it?{' '}
            <Text style={authScreenStyles.footerAccent}>Back to sign in</Text>
          </Text>
        </Pressable>
      </Link>
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
