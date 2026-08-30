import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export function SessionRestoring() {
  return (
    <View style={styles.container} testID="session-restoring">
      <ActivityIndicator
        accessibilityLabel="Restoring your session"
        size="large"
      />
      <Text style={styles.title}>Keylornet</Text>
      <Text accessibilityLiveRegion="polite" style={styles.message}>
        Restoring your session…
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#101b2d',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  message: { color: '#d9e4f7', fontSize: 16, marginTop: 12 },
  title: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '700',
    marginTop: 20,
  },
});
