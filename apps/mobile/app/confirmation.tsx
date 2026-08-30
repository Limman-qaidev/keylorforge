import { Link } from 'expo-router';
import { Text } from 'react-native';

import { AuthScreen, authScreenStyles } from '@/components/auth/auth-screen';
import { RequireSignedOut } from '@/components/auth/auth-guards';
import { useAuth } from '@/lib/auth/auth-provider';

function ConfirmationScreen() {
  const { clearConfirmation, confirmationEmail } = useAuth();

  return (
    <AuthScreen title="Check your email">
      <Text style={authScreenStyles.link}>
        {confirmationEmail
          ? `We sent a confirmation link to ${confirmationEmail}. Confirm your email, then sign in.`
          : 'Confirm your email, then sign in.'}
      </Text>
      <Link
        accessibilityRole="link"
        href="/sign-in"
        onPress={clearConfirmation}
        style={authScreenStyles.link}
      >
        <Text>Back to sign in</Text>
      </Link>
    </AuthScreen>
  );
}

export default function ConfirmationRoute() {
  return (
    <RequireSignedOut allowConfirmationPending>
      <ConfirmationScreen />
    </RequireSignedOut>
  );
}
