import { Link } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export type ShellDestination =
  'home' | 'progress' | 'train' | 'social' | 'profile';

type NavigationItem = {
  destination: ShellDestination;
  glyph: string;
  href: '/home' | '/progress' | '/train' | '/social' | '/profile';
  label: string;
  primary?: boolean;
};

const navigationItems: readonly NavigationItem[] = [
  { destination: 'home', glyph: '⌂', href: '/home', label: 'Inicio' },
  { destination: 'progress', glyph: '▥', href: '/progress', label: 'Progreso' },
  {
    destination: 'train',
    glyph: 'ϟ',
    href: '/train',
    label: 'Entrenar',
    primary: true,
  },
  { destination: 'social', glyph: '♧', href: '/social', label: 'Social' },
  { destination: 'profile', glyph: '◯', href: '/profile', label: 'Perfil' },
];

type AuthenticatedShellProps = PropsWithChildren<{
  activeDestination: ShellDestination;
}>;

export function AuthenticatedShell({
  activeDestination,
  children,
}: AuthenticatedShellProps) {
  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.content}>
        {children}
      </SafeAreaView>
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <View
          accessibilityLabel="Navegación principal"
          accessibilityRole="tablist"
          style={styles.navigation}
        >
          {navigationItems.map((item) => {
            const isActive = item.destination === activeDestination;
            const isPrimary = item.primary === true;

            return (
              <Link href={item.href} asChild key={item.destination}>
                <Pressable
                  accessibilityLabel={item.label}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  testID={
                    isPrimary ? 'primary-training-destination' : undefined
                  }
                  style={({ pressed }) => [
                    styles.navigationItem,
                    isPrimary && styles.primaryNavigationItem,
                    pressed && styles.pressed,
                  ]}
                >
                  <View
                    style={[
                      styles.glyphContainer,
                      isPrimary && styles.primaryGlyphContainer,
                      !isPrimary && isActive && styles.activeGlyphContainer,
                    ]}
                  >
                    <Text
                      accessible={false}
                      style={[
                        styles.glyph,
                        isActive && styles.activeText,
                        isPrimary && styles.primaryGlyph,
                      ]}
                    >
                      {item.glyph}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.label,
                      isActive && styles.activeText,
                      isPrimary && styles.primaryLabel,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              </Link>
            );
          })}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  activeGlyphContainer: {
    backgroundColor: '#eaf1ff',
  },
  activeText: {
    color: '#075bff',
  },
  content: {
    flex: 1,
  },
  glyph: {
    color: '#526074',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },
  glyphContainer: {
    alignItems: 'center',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    minWidth: 32,
  },
  label: {
    color: '#526074',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.1,
    marginTop: 4,
  },
  navigation: {
    alignItems: 'flex-start',
    backgroundColor: '#ffffff',
    borderTopColor: '#e8edf5',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 76,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  navigationItem: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
    minWidth: 48,
    paddingHorizontal: 1,
    paddingVertical: 2,
  },
  pressed: {
    opacity: 0.64,
  },
  primaryGlyph: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 38,
  },
  primaryGlyphContainer: {
    backgroundColor: '#075bff',
    borderColor: '#ffffff',
    borderRadius: 34,
    borderWidth: 4,
    elevation: 5,
    height: 68,
    minWidth: 68,
    shadowColor: '#075bff',
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 10,
  },
  primaryLabel: {
    color: '#075bff',
    fontWeight: '800',
    marginTop: 5,
  },
  primaryNavigationItem: {
    minHeight: 76,
    paddingTop: 0,
    transform: [{ translateY: -23 }],
  },
  root: {
    backgroundColor: '#f6f8fc',
    flex: 1,
  },
  safeArea: {
    backgroundColor: '#ffffff',
  },
});
