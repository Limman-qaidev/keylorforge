import type { PropsWithChildren } from 'react';
import { Link } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type AuthScreenProps = PropsWithChildren<{
  backHref?: '/welcome';
  subtitle?: string;
  title: string;
}>;

export function AuthScreen({
  backHref,
  children,
  subtitle,
  title,
}: AuthScreenProps) {
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <View style={styles.topRow}>
            {backHref ? (
              <Link asChild href={backHref}>
                <Pressable
                  accessibilityLabel="Back to welcome"
                  accessibilityRole="button"
                  hitSlop={8}
                  style={styles.backButton}
                >
                  <Text style={styles.backButtonText}>‹</Text>
                </Pressable>
              </Link>
            ) : (
              <View style={styles.backButtonPlaceholder} />
            )}
            <AuthBrand compact />
            <View style={styles.backButtonPlaceholder} />
          </View>
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function AuthBrand({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.brand, compact ? styles.compactBrand : undefined]}>
      <Text accessibilityElementsHidden style={styles.brandBolt}>
        ϟ
      </Text>
      <Text accessibilityRole="header" style={styles.brandKeylor}>
        KEYLOR
      </Text>
      <Text accessibilityRole="header" style={styles.brandFit}>
        FIT
      </Text>
    </View>
  );
}

export const authScreenStyles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#1769ff',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 16,
  },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  error: { color: '#ff9b9b', fontSize: 14, lineHeight: 20, marginTop: 12 },
  input: {
    color: '#f8fbff',
    flex: 1,
    fontSize: 16,
    minHeight: 54,
    paddingHorizontal: 16,
  },
  inputContainer: {
    alignItems: 'center',
    backgroundColor: '#121b28',
    borderColor: '#4c5868',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    minHeight: 56,
  },
  inputLabel: {
    color: '#f8fbff',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 22,
  },
  link: {
    color: '#2c82ff',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 20,
    minHeight: 48,
    paddingVertical: 14,
    textAlign: 'center',
  },
});

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  backButtonPlaceholder: { height: 48, width: 48 },
  backButtonText: {
    color: '#ffffff',
    fontSize: 42,
    fontWeight: '300',
    lineHeight: 42,
  },
  brand: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  brandBolt: {
    color: '#ffbf2f',
    fontSize: 31,
    fontWeight: '800',
    lineHeight: 34,
    marginRight: 5,
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
  },
  compactBrand: { flex: 1 },
  container: {
    backgroundColor: '#050b14',
    flex: 1,
  },
  content: { maxWidth: 480, width: '100%' },
  heading: { marginTop: 56 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 16,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  subtitle: { color: '#c1c9d5', fontSize: 17, lineHeight: 24, marginTop: 8 },
  title: {
    color: '#ffffff',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1.1,
    lineHeight: 42,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
