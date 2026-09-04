import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth, type SocialAuthProvider } from '@/lib/auth/auth-provider';

const providers: Array<{ label: string; provider: SocialAuthProvider }> = [
  { label: 'Continue with Google', provider: 'google' },
  { label: 'Continue with Apple', provider: 'apple' },
];

export function SocialAuthButtons() {
  const { signInWithSocial, socialAuthCapabilities } = useAuth();
  const [pendingProvider, setPendingProvider] =
    useState<SocialAuthProvider | null>(null);

  const availableProviders = providers.filter(
    ({ provider }) => socialAuthCapabilities[provider],
  );

  if (availableProviders.length === 0) {
    return null;
  }

  const start = async (provider: SocialAuthProvider) => {
    if (pendingProvider) {
      return;
    }

    setPendingProvider(provider);
    try {
      await signInWithSocial(provider);
    } finally {
      setPendingProvider(null);
    }
  };

  return (
    <View style={styles.container}>
      <View accessibilityElementsHidden style={styles.dividerRow}>
        <View style={styles.divider} />
        <Text style={styles.dividerText}>OR</Text>
        <View style={styles.divider} />
      </View>
      {availableProviders.map(({ label, provider }) => {
        const pending = pendingProvider === provider;
        return (
          <Pressable
            accessibilityLabel={label}
            accessibilityRole="button"
            disabled={pendingProvider !== null}
            key={provider}
            onPress={() => void start(provider)}
            style={({ pressed }) => [
              styles.providerButton,
              pressed && styles.providerButtonPressed,
              pendingProvider !== null && styles.providerButtonDisabled,
            ]}
          >
            {pending ? (
              <ActivityIndicator color="#f8fbff" />
            ) : (
              <Text style={styles.providerButtonText}>{label}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 22 },
  divider: { backgroundColor: '#334155', flex: 1, height: 1 },
  dividerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  dividerText: {
    color: '#8390a3',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  providerButton: {
    alignItems: 'center',
    backgroundColor: '#111b28',
    borderColor: '#3f4c5d',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 10,
    minHeight: 54,
    paddingHorizontal: 16,
  },
  providerButtonDisabled: { opacity: 0.65 },
  providerButtonPressed: { backgroundColor: '#192638' },
  providerButtonText: {
    color: '#f8fbff',
    fontSize: 16,
    fontWeight: '700',
  },
});
