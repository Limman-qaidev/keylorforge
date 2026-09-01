import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from './tokens';
export function SectionHeading({
  detail,
  title,
}: {
  detail?: string;
  title: string;
}) {
  return (
    <View style={styles.row}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}
const styles = StyleSheet.create({
  detail: { color: colors.training, ...typography.caption },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: { color: colors.text, ...typography.section },
});
