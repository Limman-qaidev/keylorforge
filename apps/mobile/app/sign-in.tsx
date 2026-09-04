import { Link, useLocalSearchParams } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { AuthScreen, authScreenStyles } from '@/components/auth/auth-screen';
import { RequireSignedOut } from '@/components/auth/auth-guards';
import { EmailPasswordForm } from '@/components/auth/email-password-form';
import { SocialAuthButtons } from '@/components/auth/social-auth-buttons';
import { useAuth } from '@/lib/auth/auth-provider';

function SignInScreen() {
  const { feedback, signIn } = useAuth();
  const { confirmed, passwordUpdated } = useLocalSearchParams<{
    confirmed?: string;
    passwordUpdated?: string;
  }>();

  return (
    <AuthScreen backHref="/welcome" subtitle="Welcome back." title="Sign in">
      {feedback ? (
        <Text style={authScreenStyles.error}>{feedback.message}</Text>
      ) : null}
      {confirmed === 'true' ? (
        <Text accessibilityRole="alert" style={authScreenStyles.success}>
          Email confirmed. You can now sign in.
        </Text>
      ) : null}
      {passwordUpdated === 'true' ? (
        <Text accessibilityRole="alert" style={authScreenStyles.success}>
          Password updated. Sign in with your new password.
        </Text>
      ) : null}
      <EmailPasswordForm
        actionLabel="Sign in"
        onSubmit={({ email, password }) => signIn(email, password)}
      />
      <SocialAuthButtons />
      <Link asChild href="/password-recovery">
        <Pressable
          accessibilityRole="link"
          style={authScreenStyles.footerAction}
        >
          <Text style={authScreenStyles.footerAccent}>
            Forgot your password?
          </Text>
        </Pressable>
      </Link>
      <Link asChild href="/sign-up">
        <Pressable
          accessibilityRole="link"
          style={authScreenStyles.footerAction}
        >
          <Text style={authScreenStyles.footerText}>
            Need an account?{' '}
            <Text style={authScreenStyles.footerAccent}>Create one</Text>
          </Text>
        </Pressable>
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
