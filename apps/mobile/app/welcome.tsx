import { Link } from 'expo-router';
import {
  ImageBackground,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AuthBrand } from '@/components/auth/auth-screen';
import { RequireSignedOut } from '@/components/auth/auth-guards';

const welcomeHero = require('../assets/images/welcome-hero.png');

export default function WelcomeRoute() {
  return (
    <RequireSignedOut>
      <ImageBackground source={welcomeHero} style={styles.hero}>
        <StatusBar barStyle="light-content" />
        <View style={styles.overlay}>
          <View style={styles.brandArea}>
            <AuthBrand />
          </View>
          <View style={styles.content}>
            <Text accessibilityRole="header" style={styles.headline}>
              Train.{'\n'}
              <Text style={styles.headlineTeal}>Progress.</Text>
              {'\n'}
              <Text style={styles.headlinePurple}>Surpass yourself.</Text>
            </Text>
            <Text style={styles.supportingText}>
              Your best version starts with every rep.
            </Text>
          </View>
          <View style={styles.actions}>
            <Link asChild href="/sign-up">
              <Pressable
                accessibilityRole="button"
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>Create account</Text>
              </Pressable>
            </Link>
            <Link asChild href="/sign-in">
              <Pressable
                accessibilityRole="button"
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Sign in</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </ImageBackground>
    </RequireSignedOut>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 14, paddingBottom: 32 },
  brandArea: { paddingTop: (StatusBar.currentHeight ?? 0) + 24 },
  content: { flex: 1, justifyContent: 'center' },
  headline: {
    color: '#ffffff',
    fontSize: 46,
    fontWeight: '900',
    letterSpacing: -1.8,
    lineHeight: 52,
  },
  headlinePurple: { color: '#8562ff' },
  headlineTeal: { color: '#24ddd1' },
  hero: { flex: 1 },
  overlay: {
    backgroundColor: 'rgba(3, 10, 20, 0.22)',
    flex: 1,
    paddingHorizontal: 24,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1769ff',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 56,
  },
  primaryButtonText: { color: '#ffffff', fontSize: 17, fontWeight: '800' },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(3, 10, 20, 0.55)',
    borderColor: 'rgba(255, 255, 255, 0.65)',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 56,
  },
  secondaryButtonText: { color: '#ffffff', fontSize: 17, fontWeight: '800' },
  supportingText: {
    color: '#ffffff',
    fontSize: 18,
    lineHeight: 26,
    marginTop: 18,
    maxWidth: 250,
  },
});
