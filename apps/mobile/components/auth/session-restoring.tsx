import { StyleSheet, Text } from 'react-native';

import { LoadingState } from '@/components/ui/loading-state';
import { Screen } from '@/components/ui/screen';
import { colors, spacing, typography } from '@/components/ui/tokens';

export function SessionRestoring() {
  return (
    <Screen centered>
      <Text style={styles.brand}>KEYLORFIT</Text>
      <LoadingState label="Restoring your session…" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: {
    color: colors.accent,
    fontSize: typography.eyebrow.fontSize,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: spacing.md,
  },
});
