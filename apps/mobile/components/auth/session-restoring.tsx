import { StyleSheet, Text, View } from 'react-native';
import { LoadingState } from '@/components/ui/feedback';
import { colors, spacing, typography } from '@/components/ui/tokens';

export function SessionRestoring() {
  return (
    <View style={styles.container} testID="session-restoring">
      <Text style={styles.brand}>
        ⚡ KEYLOR<Text style={styles.brandAccent}>FIT</Text>
      </Text>
      <LoadingState label="Restoring your session…" />
    </View>
  );
}

const styles = StyleSheet.create({
  brand: { color: colors.text, ...typography.section },
  brandAccent: { color: colors.progress },
  container: { backgroundColor: colors.canvas, flex: 1, padding: spacing.xl },
});
