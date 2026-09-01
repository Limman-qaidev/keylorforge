import { type ReactNode, useState } from 'react';
import type { TextInputProps } from 'react-native';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radii, spacing, touchTarget, typography } from './tokens';
export function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}
export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityLiveRegion="polite" style={styles.error}>
      {children}
    </Text>
  );
}
export function FormInput(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.textMuted}
      style={styles.input}
      {...props}
    />
  );
}
export function PasswordInput(props: Omit<TextInputProps, 'secureTextEntry'>) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.passwordRow}>
      <TextInput
        placeholderTextColor={colors.textMuted}
        secureTextEntry={!visible}
        style={[styles.input, styles.passwordInput]}
        {...props}
      />
      <Pressable
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        accessibilityRole="button"
        onPress={() => setVisible((current) => !current)}
        style={styles.visibility}
      >
        <Text style={styles.visibilityText}>{visible ? 'Hide' : 'Show'}</Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  error: { color: colors.error, marginTop: spacing.sm, ...typography.caption },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.text,
    marginTop: spacing.sm,
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
    ...typography.body,
  },
  label: { color: colors.text, marginTop: spacing.lg, ...typography.label },
  passwordInput: { flex: 1, marginTop: 0 },
  passwordRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  visibility: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touchTarget,
    minWidth: touchTarget,
  },
  visibilityText: { color: colors.training, ...typography.label },
});
