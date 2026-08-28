import { StyleSheet, Text, View } from 'react-native';

import { getApiBaseUrl } from '@/lib/api/client';

export function DevelopmentStatus() {
  const apiBaseUrl = getApiBaseUrl();

  return (
    <View style={styles.container} accessibilityRole="summary">
      <Text style={styles.heading}>Keylornet mobile</Text>
      <Text style={styles.message}>Development foundation is ready.</Text>
      <Text style={styles.endpoint} selectable>
        API base URL: {apiBaseUrl ?? 'Not configured'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  heading: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    marginBottom: 8,
  },
  endpoint: {
    fontSize: 14,
    textAlign: 'center',
  },
});
