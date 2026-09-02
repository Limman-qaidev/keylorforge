import { StyleSheet, Text, View } from 'react-native';

type BrandVariant = 'welcome' | 'auth';

type BrandBoltProps = {
  color: string;
  size?: number;
};

function BrandBolt({ color, size = 32 }: BrandBoltProps) {
  const scale = size / 32;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height: 34 * scale, width: 22 * scale }}
    >
      <View
        style={[
          styles.boltSegment,
          {
            backgroundColor: color,
            height: 18 * scale,
            left: 10 * scale,
            top: 0,
            transform: [{ rotate: '18deg' }],
            width: 7 * scale,
          },
        ]}
      />
      <View
        style={[
          styles.boltSegment,
          {
            backgroundColor: color,
            height: 7 * scale,
            left: 4 * scale,
            top: 14 * scale,
            transform: [{ rotate: '-12deg' }],
            width: 15 * scale,
          },
        ]}
      />
      <View
        style={[
          styles.boltSegment,
          {
            backgroundColor: color,
            height: 18 * scale,
            left: 4 * scale,
            top: 16 * scale,
            transform: [{ rotate: '18deg' }],
            width: 7 * scale,
          },
        ]}
      />
    </View>
  );
}

export function KeylorFitBrand({
  compact = false,
  variant,
}: {
  compact?: boolean;
  variant: BrandVariant;
}) {
  const boltColor = variant === 'welcome' ? '#ffffff' : '#ffbf2f';

  return (
    <View style={[styles.brand, compact ? styles.compactBrand : undefined]}>
      <BrandBolt color={boltColor} size={compact ? 28 : 31} />
      <Text accessibilityRole="header" style={styles.brandKeylor}>
        KEYLOR
      </Text>
      <Text accessibilityRole="header" style={styles.brandFit}>
        FIT
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  boltSegment: { position: 'absolute' },
  brand: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  brandFit: {
    color: '#2de1d2',
    fontSize: 23,
    fontStyle: 'italic',
    fontWeight: '800',
    letterSpacing: -1,
  },
  brandKeylor: {
    color: '#ffffff',
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: -1,
    marginLeft: 7,
  },
  compactBrand: { flex: 1 },
});
