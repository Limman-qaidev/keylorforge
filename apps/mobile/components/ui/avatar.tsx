import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from './tokens';
export function Avatar({
  name,
  size = 48,
}: {
  name?: string | null;
  size?: number;
}) {
  const initials = (
    name
      ?.trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join('')
      .slice(0, 2) || 'KF'
  ).toUpperCase();
  return (
    <View
      accessibilityLabel={`${name || 'KeylorFit'} avatar`}
      style={[
        styles.avatar,
        { borderRadius: size / 2, height: size, width: size },
      ]}
    >
      <Text style={styles.text}>{initials}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.training,
    justifyContent: 'center',
  },
  text: { color: colors.onDark, ...typography.label },
});
