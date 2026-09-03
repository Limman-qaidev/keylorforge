import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthScreen, authScreenStyles } from '@/components/auth/auth-screen';
import { RequireSignedOut } from '@/components/auth/auth-guards';
import { useAuth } from '@/lib/auth/auth-provider';

function ConfirmationScreen() {
  const { clearConfirmation, confirmationEmail } = useAuth();

  return (
    <AuthScreen
      subtitle="One last step before your first workout."
      title="Check your inbox"
    >
      <View style={styles.card}>
        <Text style={styles.eyebrow}>CONFIRM YOUR EMAIL</Text>
        <Text style={styles.message}>
          We sent a secure confirmation link to
        </Text>
        {confirmationEmail ? (
          <Text selectable style={styles.email}>
            {confirmationEmail}
          </Text>
        ) : null}
        <Text style={styles.hint}>
          Open the link on this device. KeylorFit will bring you back to sign in
          when your email is confirmed.
        </Text>
      </View>
      <Link asChild href="/sign-in" onPress={clearConfirmation}>
        <Pressable accessibilityRole="button" style={authScreenStyles.button}>
          <Text style={authScreenStyles.buttonText}>Back to sign in</Text>
        </Pressable>
      </Link>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111b28',
    borderColor: '#3f4c5d',
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 22,
    marginTop: 28,
    padding: 20,
  },
  email: {
    color: '#2de1d2',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 6,
  },
  eyebrow: {
    color: '#ffc107',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 14,
  },
  hint: {
    color: '#aeb9c9',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 18,
  },
  message: {
    color: '#f8fbff',
    fontSize: 16,
    lineHeight: 23,
  },
});

export default function ConfirmationRoute() {
  return (
    <RequireSignedOut allowConfirmationPending>
      <ConfirmationScreen />
    </RequireSignedOut>
  );
}
