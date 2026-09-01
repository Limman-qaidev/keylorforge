import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
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
    <Screen centered>
      <View style={styles.content}>
        <Text style={styles.brand}>KEYLORFIT</Text>
        <Card>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {children}
        </Card>
      </View>
    </Screen>
  );
}

export const authScreenStyles = StyleSheet.create({
  helper: {
    color: colors.secondary,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
    marginTop: spacing.lg,
  },
  link: {
    color: colors.accent,
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    lineHeight: typography.label.lineHeight,
    marginTop: spacing.lg,
    minHeight: touchTarget,
    minWidth: touchTarget,
    paddingVertical: spacing.md,
  },
});

const styles = StyleSheet.create({
  brand: {
    color: colors.accent,
    fontSize: typography.eyebrow.fontSize,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: spacing.md,
  },
  content: { width: '100%' },
  subtitle: {
    color: colors.secondary,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
    marginTop: spacing.sm,
  },
  title: {
    color: colors.primary,
    fontSize: typography.heading.fontSize,
    fontWeight: '700',
    lineHeight: typography.heading.lineHeight,
  },
});
