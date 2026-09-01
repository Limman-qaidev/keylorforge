import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RequireAuthenticated } from '@/components/auth/auth-guards';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorMessage } from '@/components/ui/form';
import { Screen } from '@/components/ui/screen';
import { SectionHeading } from '@/components/ui/section-heading';
import { colors, spacing, typography } from '@/components/ui/tokens';
import { useAuth } from '@/lib/auth/auth-provider';

function HomeScreen() {
  const { session, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const email = session?.user.email ?? 'athlete';
  const name =
    session?.user.user_metadata.display_name ??
    email.split('@')[0] ??
    'Athlete';

  const onSignOut = async () => {
    setError(null);
    const result = await signOut();
    setError(result.error ?? null);
  };

  return (
    <Screen scroll>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.eyebrow}>KEYLORFIT</Text>
          <Text accessibilityRole="header" style={styles.title}>
            Ready to train?
          </Text>
        </View>
        <Avatar name={name} />
      </View>
      <Text style={styles.subtitle}>
        Your training home is ready when you are.
      </Text>
      <View style={styles.section}>
        <SectionHeading title="Your account" />
        <Card>
          <Link
            accessibilityRole="link"
            href="/profile"
            style={styles.profileLink}
          >
            <View>
              <Text style={styles.cardTitle}>{name}</Text>
              <Text style={styles.cardMeta}>{email}</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </Link>
        </Card>
      </View>
      <View style={styles.section}>
        <SectionHeading title="Training" />
        <Card>
          <Text style={styles.cardTitle}>Your next session starts here.</Text>
          <Text style={styles.cardMeta}>
            Workout tracking will appear here when it becomes available.
          </Text>
        </Card>
      </View>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      <View style={styles.signOut}>
        <Button variant="secondary" onPress={onSignOut}>
          Sign out
        </Button>
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
  arrow: { color: colors.training, fontSize: 28, fontWeight: '400' },
  cardMeta: {
    color: colors.textMuted,
    marginTop: spacing.xs,
    ...typography.caption,
  },
  cardTitle: { color: colors.text, ...typography.label },
  eyebrow: { color: colors.progress, ...typography.caption },
  profileLink: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  section: { marginTop: spacing.xxl },
  signOut: { marginTop: 'auto', paddingTop: spacing.xxxl },
  subtitle: {
    color: colors.textMuted,
    marginTop: spacing.sm,
    ...typography.body,
  },
  title: { color: colors.text, ...typography.title },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
