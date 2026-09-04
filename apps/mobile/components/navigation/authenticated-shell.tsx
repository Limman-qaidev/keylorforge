import { Link } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export type ShellDestination =
  | 'home'
  | 'progress'
  | 'train'
  | 'social'
  | 'profile';

type NavigationItem = {
  destination: ShellDestination;
  glyph: string;
  href: '/home' | '/progress' | '/train' | '/social' | '/profile';
  label: string;
  primary?: boolean;
};

const navigationItems: readonly NavigationItem[] = [
  { destination: 'home', glyph: '⌂', href: '/home', label: 'Inicio' },
  { destination: 'progress', glyph: '↗', href: '/progress', label: 'Progreso' },
  {
    destination: 'train',
    glyph: '+',
    href: '/train',
    label: 'Entrenar',
    primary: true,
  },
  { destination: 'social', glyph: '◎', href: '/social', label: 'Social' },
  { destination: 'profile', glyph: '●', href: '/profile', label: 'Perfil' },
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
      <View style={styles.content}>{children}</View>
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <View accessibilityLabel="Navegación principal" style={styles.navigation}>
          {navigationItems.map((item) => {
            const isActive = item.destination === activeDestination;
            const isPrimary = item.primary === true;

            return (
              <Link href={item.href} asChild key={item.destination}>
                <Pressable
                  accessibilityLabel={item.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  testID={isPrimary ? 'primary-training-destination' : undefined}
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
    backgroundColor: '#e8f7f5',
  },
  activeText: {
    color: '#007f76',
  },
  content: {
    flex: 1,
  },
  glyph: {
    color: '#667085',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22,
  },
  glyphContainer: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    minWidth: 36,
  },
  label: {
    color: '#667085',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  navigation: {
    alignItems: 'flex-end',
    backgroundColor: '#ffffff',
    borderTopColor: '#e4e7ec',
    borderTopWidth: 1,
    flexDirection: 'row',
    minHeight: 68,
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  navigationItem: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 58,
    minWidth: 48,
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
  pressed: {
    opacity: 0.68,
  },
  primaryGlyph: {
    color: '#ffffff',
    fontSize: 30,
    lineHeight: 32,
  },
  primaryGlyphContainer: {
    backgroundColor: '#00afa1',
    borderColor: '#ffffff',
    borderRadius: 28,
    borderWidth: 4,
    height: 56,
    minWidth: 56,
  },
  primaryLabel: {
    color: '#005f59',
    fontWeight: '700',
    marginTop: 3,
  },
  primaryNavigationItem: {
    minHeight: 76,
    paddingTop: 0,
    transform: [{ translateY: -12 }],
  },
  root: {
    backgroundColor: '#f7f9fc',
    flex: 1,
  },
  safeArea: {
    backgroundColor: '#ffffff',
  },
});
