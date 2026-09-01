import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, radii, spacing, touchTarget, typography } from './tokens';

type ButtonProps = {
  accessibilityLabel?: string;
  children: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'destructive';
};
export function Button({
  accessibilityLabel,
  children,
  disabled = false,
  loading = false,
  onPress,
  variant = 'primary',
}: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        inactive && styles.disabled,
        pressed && !inactive && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'secondary' ? colors.training : colors.onDark}
        />
      ) : (
        <Text
          style={[
            styles.label,
            variant === 'secondary' && styles.secondaryLabel,
          ]}
        >
          {children}
        </Text>
      )}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: radii.sm,
    justifyContent: 'center',
    minHeight: touchTarget,
    paddingHorizontal: spacing.lg,
  },
  destructive: { backgroundColor: colors.error },
  disabled: { backgroundColor: colors.disabled },
  label: { color: colors.onDark, ...typography.label },
  pressed: { opacity: 0.86 },
  primary: { backgroundColor: colors.training },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.training,
    borderWidth: 1,
  },
  secondaryLabel: { color: colors.training },
});
