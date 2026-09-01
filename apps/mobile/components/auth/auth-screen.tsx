import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/ui/screen';
import {
  colors,
  spacing,
  touchTarget,
  typography,
} from '@/components/ui/tokens';

type AuthScreenProps = PropsWithChildren<{
  subtitle?: string;
  title: string;
}>;

export function AuthScreen({ children, subtitle, title }: AuthScreenProps) {
  return (
    <Screen scroll>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.brand}>
          ⚡ KEYLOR<Text style={styles.brandAccent}>FIT</Text>
        </Text>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
      </View>
    </Screen>
  );
}

export const authScreenStyles = StyleSheet.create({
  error: { color: colors.error, marginTop: spacing.md, ...typography.caption },
  link: {
    color: colors.training,
    marginTop: spacing.sm,
    minHeight: touchTarget,
    paddingVertical: spacing.md,
    textAlign: 'center',
    ...typography.label,
  },
});

const styles = StyleSheet.create({
  brand: {
    color: colors.text,
    marginBottom: spacing.xxxl,
    ...typography.section,
  },
  brandAccent: { color: colors.progress },
  content: { flex: 1, justifyContent: 'center', width: '100%' },
  subtitle: {
    color: colors.textMuted,
    marginTop: spacing.sm,
    ...typography.body,
  },
  title: { color: colors.text, ...typography.title },
});
