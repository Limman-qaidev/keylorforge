import { Link } from 'expo-router';
import { Text } from 'react-native';

import { AuthScreen, authScreenStyles } from '@/components/auth/auth-screen';
import { RequireSignedOut } from '@/components/auth/auth-guards';
import { EmailPasswordForm } from '@/components/auth/email-password-form';
import { useAuth } from '@/lib/auth/auth-provider';

function SignUpScreen() {
  const { signUp } = useAuth();

  return (
    <AuthScreen
      subtitle="Create a KeylorFit account with an email address and password."
      title="Create your account"
    >
      <EmailPasswordForm
        actionLabel="Create account"
        onSubmit={({ email, password }) => signUp(email, password)}
      />
      <Link
        accessibilityRole="link"
        href="/sign-in"
        style={authScreenStyles.link}
      >
        <Text>Already have an account? Sign in</Text>
      </Link>
    </AuthScreen>
  );
}

export default function SignUpRoute() {
  return (
    <RequireSignedOut>
      <SignUpScreen />
    </RequireSignedOut>
  );
}
