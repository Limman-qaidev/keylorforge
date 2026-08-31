import { Link } from 'expo-router';
import { Text } from 'react-native';

import { RequireSignedOut } from '@/components/auth/auth-guards';
import { AuthScreen, authScreenStyles } from '@/components/auth/auth-screen';
import { EmailPasswordForm } from '@/components/auth/email-password-form';
import { ErrorMessage } from '@/components/ui/form';
import { useAuth } from '@/lib/auth/auth-provider';

function SignInScreen() {
  const { feedback, signIn } = useAuth();

  return (
    <AuthScreen
      subtitle="Use your KeylorFit email and password."
      title="Sign in"
    >
      {feedback ? <ErrorMessage>{feedback.message}</ErrorMessage> : null}
      <EmailPasswordForm
        actionLabel="Sign in"
        onSubmit={({ email, password }) => signIn(email, password)}
      />
      <Link
        accessibilityRole="link"
        href="/sign-up"
        style={authScreenStyles.link}
      >
        <Text>Need an account? Create one</Text>
      </Link>
    </AuthScreen>
  );
}

export default function SignInRoute() {
  return (
    <RequireSignedOut>
      <SignInScreen />
    </RequireSignedOut>
  );
}
