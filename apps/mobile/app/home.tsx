import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RequireAuthenticated } from '@/components/auth/auth-guards';
import { useAuth } from '@/lib/auth/auth-provider';

function HomeScreen() {
  const { signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const onSignOut = async () => {
    setError(null);
    const result = await signOut();
    setError(result.error ?? null);
  };

  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        Your training home
      </Text>
      <Text style={styles.message}>You are signed in to KeylorFit.</Text>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={onSignOut}
        style={styles.button}
      >
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

export default function HomeRoute() {
  return (
    <RequireAuthenticated>
      <HomeScreen />
    </RequireAuthenticated>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#275dad',
    borderRadius: 8,
    marginTop: 28,
    minHeight: 48,
    padding: 14,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  error: { color: '#b42318', marginTop: 12 },
  message: { color: '#4d5d74', fontSize: 16, marginTop: 12 },
  title: { color: '#101b2d', fontSize: 30, fontWeight: '700' },
});
