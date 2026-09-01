import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from './tokens';
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.loading}>
      <ActivityIndicator accessibilityLabel={label} color={colors.training} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}
export function Skeleton({
  width = '100%',
}: {
  width?: number | `${number}%`;
}) {
  return (
    <View
      accessibilityLabel="Loading content"
      style={[styles.skeleton, { width }]}
    />
  );
}
export function EmptyState({ body, title }: { body: string; title: string }) {
  return (
    <View style={styles.empty}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <Text style={styles.muted}>{body}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  empty: { alignItems: 'center', paddingVertical: spacing.xxxl },
  loading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  muted: {
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
    ...typography.body,
  },
  skeleton: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.sm,
    height: 16,
  },
  title: { color: colors.text, ...typography.section },
});
