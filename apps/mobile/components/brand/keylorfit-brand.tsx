import { Image, StyleSheet } from 'react-native';

type BrandVariant = 'welcome' | 'auth';

const lockups = {
  auth: require('../../assets/brand/keylorfit-g4-lockup-auth.png'),
  welcome: require('../../assets/brand/keylorfit-g4-lockup-welcome.png'),
} as const;

export function KeylorFitBrand({
  compact = false,
  variant,
}: {
  compact?: boolean;
  variant: BrandVariant;
}) {
  return (
    <Image
      accessibilityLabel="KeylorFit"
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
    width: 184,
  },
  default: {
    height: 63,
    width: 240,
  },
});
