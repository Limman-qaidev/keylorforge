import { Link } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { AuthScreen, authScreenStyles } from '@/components/auth/auth-screen';
import { RequireSignedOut } from '@/components/auth/auth-guards';
import { EmailPasswordForm } from '@/components/auth/email-password-form';
import { useAuth } from '@/lib/auth/auth-provider';

function SignUpScreen() {
  const { signUp } = useAuth();

  return (
    <AuthScreen
      backHref="/welcome"
      subtitle="Join KeylorForge."
      title="Create your account"
    >
      <EmailPasswordForm
        actionLabel="Create account"
        onSubmit={({ email, password }) => signUp(email, password)}
      />
      <Link asChild href="/sign-in">
        <Pressable
          accessibilityRole="link"
          style={authScreenStyles.footerAction}
        >
          <Text style={authScreenStyles.footerText}>
            Already have an account?{' '}
            <Text style={authScreenStyles.footerAccent}>Sign in</Text>
          </Text>
        </Pressable>
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
