import { Image, StyleSheet } from 'react-native';

const mark = require('../../assets/brand/keylorforge-g4-mark-white.png');

type KeylorForgeG4MarkProps = {
  size: number;
  testID?: string;
};

export function KeylorForgeG4Mark({ size, testID }: KeylorForgeG4MarkProps) {
  return (
    <Image
      accessible={false}
      resizeMode="contain"
      source={mark}
      style={[styles.mark, { height: size, width: size }]}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  mark: {
    flexShrink: 0,
  },
});
