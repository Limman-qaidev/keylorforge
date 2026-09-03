import { Link } from 'expo-router';
import {
  ImageBackground,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RequireSignedOut } from '@/components/auth/auth-guards';
import { KeylorFitBrand } from '@/components/brand/keylorfit-brand';

const welcomeHero = require('../assets/images/welcome-hero.png');

export default function WelcomeRoute() {
  return (
    <RequireSignedOut>
      <ImageBackground
        resizeMode="cover"
        source={welcomeHero}
        style={styles.hero}
      >
        <StatusBar barStyle="light-content" />
        <SafeAreaView edges={['top', 'bottom']} style={styles.overlay}>
          <View style={styles.brandArea}>
            <KeylorFitBrand variant="welcome" />
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
              <Pressable accessibilityRole="button" style={styles.signInAction}>
                <Text style={styles.signInText}>
                  Already have an account?{' '}
                  <Text style={styles.signInAccent}>Sign in</Text>
                </Text>
              </Pressable>
            </Link>
          </View>
        </SafeAreaView>
      </ImageBackground>
    </RequireSignedOut>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 4, paddingBottom: 8 },
  brandArea: { paddingTop: 18 },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 54,
  },
  headline: {
    color: '#ffffff',
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -1.2,
    lineHeight: 44,
    maxWidth: 330,
  },
  headlinePurple: { color: '#8562ff' },
  headlineTeal: { color: '#24ddd1' },
  hero: { flex: 1 },
  overlay: {
    backgroundColor: 'rgba(3, 10, 20, 0.28)',
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
  signInAccent: { color: '#2de1d2', fontWeight: '800' },
  signInAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 12,
  },
  signInText: {
    color: 'rgba(255, 255, 255, 0.84)',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  supportingText: {
    color: '#ffffff',
    fontSize: 16,
    lineHeight: 23,
    marginTop: 14,
    maxWidth: 260,
  },
});
