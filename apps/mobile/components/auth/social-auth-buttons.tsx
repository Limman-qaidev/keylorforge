import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  getSocialAuthCapabilities,
  type SocialAuthProvider,
} from '@/lib/auth/social-auth';

type SocialAuthButtonsProps = {
  onSignIn: (provider: SocialAuthProvider) => Promise<unknown>;
};

type ProviderButtonProps = {
  label: string;
  onPress: () => void;
};

function ProviderButton({ label, onPress }: ProviderButtonProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.providerButton,
        pressed ? styles.providerButtonPressed : null,
      ]}
    >
      <Text style={styles.providerButtonText}>{label}</Text>
    </Pressable>
  );
}

export function SocialAuthButtons({ onSignIn }: SocialAuthButtonsProps) {
  const capabilities = getSocialAuthCapabilities();
  if (!capabilities.google && !capabilities.apple) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View accessibilityElementsHidden style={styles.dividerRow}>
        <View style={styles.divider} />
        <Text style={styles.dividerLabel}>or</Text>
        <View style={styles.divider} />
      </View>
      {capabilities.google ? (
        <ProviderButton
          label="Continue with Google"
          onPress={() => void onSignIn('google')}
        />
      ) : null}
      {capabilities.apple ? (
        <ProviderButton
          label="Continue with Apple"
          onPress={() => void onSignIn('apple')}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
    marginTop: 18,
  },
  divider: {
    backgroundColor: '#3f4c5d',
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerLabel: {
    color: '#7f8b9c',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 10,
  },
  dividerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 2,
  },
  providerButton: {
    alignItems: 'center',
    backgroundColor: '#111b28',
    borderColor: '#3f4c5d',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
  },
  providerButtonPressed: {
    opacity: 0.82,
  },
  providerButtonText: {
    color: '#f8fbff',
    fontSize: 15,
    fontWeight: '700',
  },
});
