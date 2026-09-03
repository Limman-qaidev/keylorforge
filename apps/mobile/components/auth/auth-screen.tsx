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

import { KeylorForgeBrand } from '@/components/brand/keylorforge-brand';

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
        keyboardDismissMode="on-drag"
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
            <KeylorForgeBrand compact variant="auth" />
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

export const authScreenStyles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#1769ff',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 16,
  },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  error: { color: '#ff9b9b', fontSize: 14, lineHeight: 20, marginTop: 10 },
  footerAccent: { color: '#2de1d2', fontWeight: '800' },
  footerAction: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  footerText: {
    color: '#aeb9c9',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  input: {
    color: '#f8fbff',
    flex: 1,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 0,
  },
  inputContainer: {
    alignItems: 'center',
    backgroundColor: '#111b28',
    borderColor: '#3f4c5d',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 8,
    minHeight: 54,
    overflow: 'hidden',
  },
  inputLabel: {
    color: '#f8fbff',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 18,
  },
  link: {
    color: '#2de1d2',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 20,
  },
  success: {
    backgroundColor: '#0f352f',
    borderColor: '#00d1c1',
    borderRadius: 12,
    borderWidth: 1,
    color: '#d9fffb',
    fontSize: 15,
    lineHeight: 21,
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
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
    fontSize: 38,
    fontWeight: '300',
    lineHeight: 38,
  },
  container: {
    backgroundColor: '#050b14',
    flex: 1,
  },
  content: {
    alignSelf: 'center',
    maxWidth: 480,
    width: '100%',
  },
  heading: { marginTop: 34 },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 28,
    paddingHorizontal: 24,
    paddingTop: 18,
  },
  subtitle: {
    color: '#aeb9c9',
    fontSize: 16,
    lineHeight: 23,
    marginTop: 6,
  },
  title: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 38,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
