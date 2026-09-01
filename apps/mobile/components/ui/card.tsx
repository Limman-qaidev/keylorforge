import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, elevation, radii, spacing } from './tokens';
export function Card({ children }: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}
const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.lg,
    ...elevation.card,
  },
});
