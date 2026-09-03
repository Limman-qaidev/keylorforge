import { Image, StyleSheet } from 'react-native';

type BrandVariant = 'welcome' | 'auth';

const lockups = {
  auth: require('../../assets/brand/keylorforge-g4-lockup-auth.png'),
  welcome: require('../../assets/brand/keylorforge-g4-lockup-welcome.png'),
} as const;

export function KeylorForgeBrand({
  compact = false,
  variant,
}: {
  compact?: boolean;
  variant: BrandVariant;
}) {
  return (
    <Image
      accessibilityLabel="KeylorForge"
      accessibilityRole="image"
      resizeMode="contain"
      source={lockups[variant]}
      style={compact ? styles.compact : styles.default}
    />
  );
}

const styles = StyleSheet.create({
  compact: {
    height: 48,
    width: 208,
  },
  default: {
    height: 63,
    width: 280,
  },
});
