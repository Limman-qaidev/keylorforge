import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import {
  colors,
  radii,
  spacing,
  touchTarget,
  typography,
} from '@/components/ui/tokens';

type ButtonTone = 'primary' | 'secondary' | 'destructive';
type ButtonProps = Omit<
  ComponentProps<typeof Pressable>,
  'children' | 'style'
> & {
  loading?: boolean;
  label: string;
  tone?: ButtonTone;
};

export function Button({
  disabled,
  label,
  loading = false,
  tone = 'primary',
  ...props
}: ButtonProps) {
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: disabled ?? false }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        toneStyles[tone],
        pressed && !disabled && pressedStyles[tone],
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.label, labelStyles[tone]]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: radii.md,
    justifyContent: 'center',
    minHeight: touchTarget,
    paddingHorizontal: spacing.lg,
  },
  disabled: { opacity: 0.5 },
  label: { fontSize: typography.label.fontSize, fontWeight: '700' },
});

const toneStyles = StyleSheet.create({
  destructive: { backgroundColor: colors.danger },
  primary: { backgroundColor: colors.accent },
  secondary: {
    backgroundColor: colors.subtle,
    borderColor: colors.border,
    borderWidth: 1,
  },
});

const pressedStyles = StyleSheet.create({
  destructive: { backgroundColor: colors.dangerPressed },
  primary: { backgroundColor: colors.accentPressed },
  secondary: { backgroundColor: colors.border },
});

const labelStyles = StyleSheet.create({
  destructive: { color: colors.onDanger },
  primary: { color: colors.onAccent },
  secondary: { color: colors.primary },
});
