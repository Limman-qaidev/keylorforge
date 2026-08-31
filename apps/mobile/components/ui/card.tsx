import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, elevation, radii, spacing } from '@/components/ui/tokens';

export function Card({ children }: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.xl,
    ...elevation,
  },
});
