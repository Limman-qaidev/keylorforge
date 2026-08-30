import { Link } from 'expo-router';
import { Text } from 'react-native';

import { AuthScreen, authScreenStyles } from '@/components/auth/auth-screen';
import { RequireSignedOut } from '@/components/auth/auth-guards';

export default function WelcomeRoute() {
  return (
    <RequireSignedOut>
      <AuthScreen
        subtitle="Track the training that matters. Sign in to continue or create your account."
        title="Welcome"
      >
        <Link
          accessibilityRole="link"
          href="/sign-in"
          style={authScreenStyles.link}
        >
          <Text>Sign in</Text>
        </Link>
        <Link
          accessibilityRole="link"
          href="/sign-up"
          style={authScreenStyles.link}
        >
          <Text>Create an account</Text>
        </Link>
      </AuthScreen>
    </RequireSignedOut>
  );
}
