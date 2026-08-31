import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/components/ui/tokens';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <View accessibilityRole="progressbar" style={styles.container}>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.md,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  label: { color: colors.secondary, fontSize: typography.body.fontSize },
});
