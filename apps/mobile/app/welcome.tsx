import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RequireSignedOut } from '@/components/auth/auth-guards';
import { Screen } from '@/components/ui/screen';
import { colors, radii, spacing, typography } from '@/components/ui/tokens';

export default function WelcomeRoute() {
  return (
    <RequireSignedOut>
      <Screen>
        <View style={styles.hero}>
          <Text accessibilityRole="header" style={styles.brand}>
            ⚡ KEYLOR<Text style={styles.brandAccent}>FIT</Text>
          </Text>
          <View style={styles.statement}>
            <Text style={styles.display}>Train.</Text>
            <Text style={[styles.display, styles.progress]}>Progress.</Text>
            <Text style={[styles.display, styles.strength]}>Repeat.</Text>
          </View>
          <Text style={styles.copy}>
            Your next training session starts with a simple, focused account.
          </Text>
        </View>
        <View style={styles.actions}>
          <Link accessibilityRole="link" asChild href="/sign-up">
            <Pressable style={styles.primary}>
              <Text style={styles.primaryText}>Create account</Text>
            </Pressable>
          </Link>
          <Link accessibilityRole="link" href="/sign-in" style={styles.signIn}>
            Already have an account? Sign in
          </Link>
        </View>
      </Screen>
    </RequireSignedOut>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.lg },
  brand: { color: colors.text, ...typography.section },
  brandAccent: { color: colors.progress },
  copy: { color: colors.textMuted, maxWidth: 300, ...typography.body },
  display: { color: colors.text, ...typography.display },
  hero: {
    flex: 1,
    justifyContent: 'space-between',
    paddingBottom: spacing.xxxl,
    paddingTop: spacing.lg,
  },
  primary: {
    alignItems: 'center',
    backgroundColor: colors.training,
    borderRadius: radii.sm,
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryText: { color: colors.onDark, ...typography.label },
  progress: { color: colors.progress },
  signIn: { color: colors.training, textAlign: 'center', ...typography.label },
  statement: { gap: spacing.xs },
  strength: { color: colors.strength },
});
