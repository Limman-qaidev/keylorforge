import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';

import {
  colors,
  radii,
  spacing,
  touchTarget,
  typography,
} from '@/components/ui/tokens';

export function FormInput(props: ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      {...props}
      placeholderTextColor={colors.secondary}
      style={[styles.input, props.style]}
    />
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityLiveRegion="polite" style={styles.error}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  error: {
    color: colors.danger,
    fontSize: typography.caption.fontSize,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.primary,
    fontSize: typography.body.fontSize,
    marginTop: spacing.sm,
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
  },
  label: {
    color: colors.primary,
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    marginTop: spacing.lg,
  },
});
