import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RequireAuthenticated } from '@/components/auth/auth-guards';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorMessage } from '@/components/ui/form';
import { Screen } from '@/components/ui/screen';
import {
  colors,
  spacing,
  touchTarget,
  typography,
} from '@/components/ui/tokens';
import { useAuth } from '@/lib/auth/auth-provider';

function HomeScreen() {
  const { signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const onSignOut = async () => {
    setError(null);
    const result = await signOut();
    setError(result.error ?? null);
  };

  return (
    <Screen centered>
      <Text style={styles.eyebrow}>TRAINING SPACE</Text>
      <Text accessibilityRole="header" style={styles.title}>
        Your training home
      </Text>
      <Text style={styles.message}>You are signed in to KeylorFit.</Text>
      <Card>
        <Text style={styles.cardTitle}>Ready when you are</Text>
        <Text style={styles.cardMessage}>
          Your next training tools will appear here.
        </Text>
        <Link
          accessibilityRole="link"
          href="/profile"
          style={styles.profileLink}
        >
          Profile
        </Link>
      </Card>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      <View style={styles.signOut}>
        <Button label="Sign out" onPress={onSignOut} tone="secondary" />
      </View>
    </Screen>
  );
}

export default function HomeRoute() {
  return (
    <RequireAuthenticated>
      <HomeScreen />
    </RequireAuthenticated>
  );
}

const styles = StyleSheet.create({
  cardMessage: {
    color: colors.secondary,
    fontSize: typography.body.fontSize,
    marginTop: spacing.sm,
  },
  cardTitle: {
    color: colors.primary,
    fontSize: typography.label.fontSize,
    fontWeight: '700',
  },
  eyebrow: {
    color: colors.accent,
    fontSize: typography.eyebrow.fontSize,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  message: {
    color: colors.secondary,
    fontSize: typography.body.fontSize,
    marginBottom: spacing.xl,
    marginTop: spacing.sm,
  },
  profileLink: {
    color: colors.accent,
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    marginTop: spacing.lg,
    minHeight: touchTarget,
    paddingVertical: spacing.md,
  },
  signOut: { marginTop: spacing.xl },
  title: {
    color: colors.primary,
    fontSize: typography.display.fontSize,
    fontWeight: '700',
    lineHeight: typography.display.lineHeight,
    marginTop: spacing.sm,
  },
});
