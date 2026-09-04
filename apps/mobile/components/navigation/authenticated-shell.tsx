import { useRouter } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const trainingBolt = require('../../assets/icons/training-bolt-white.png');

export type ShellDestination =
  'home' | 'progress' | 'train' | 'social' | 'profile';

type NavigationItem = {
  destination: ShellDestination;
  glyph?: string;
  href: '/home' | '/progress' | '/train' | '/social' | '/profile';
  label: string;
  primary?: boolean;
};

const navigationItems: readonly NavigationItem[] = [
  { destination: 'home', glyph: '⌂', href: '/home', label: 'Inicio' },
  { destination: 'progress', glyph: '▥', href: '/progress', label: 'Progreso' },
  {
    destination: 'train',
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
  const router = useRouter();

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
              <Pressable
                accessibilityLabel={item.label}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                key={item.destination}
                onPress={() => router.replace(item.href)}
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
                  {isPrimary ? (
                    <Image
                      accessible={false}
                      resizeMode="contain"
                      source={trainingBolt}
                      style={styles.primaryGlyphImage}
                      testID="primary-training-icon"
                    />
                  ) : (
                    <Text
                      accessible={false}
                      style={[styles.glyph, isActive && styles.activeText]}
                    >
                      {item.glyph}
                    </Text>
                  )}
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
    minHeight: 68,
    paddingHorizontal: 8,
    paddingTop: 6,
    width: '100%',
  },
  navigationItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    minWidth: 48,
    paddingHorizontal: 0,
    paddingVertical: 2,
    width: '20%',
  },
  pressed: {
    opacity: 0.64,
  },
  primaryGlyphContainer: {
    backgroundColor: '#075bff',
    borderColor: '#ffffff',
    borderRadius: 29,
    borderWidth: 3,
    elevation: 4,
    height: 58,
    minWidth: 58,
    shadowColor: '#075bff',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  primaryGlyphImage: {
    height: 30,
    width: 30,
  },
  primaryLabel: {
    color: '#075bff',
    fontWeight: '800',
    marginTop: 3,
  },
  primaryNavigationItem: {
    minHeight: 68,
    transform: [{ translateY: -14 }],
  },
  root: {
    backgroundColor: '#f6f8fc',
    flex: 1,
  },
  safeArea: {
    backgroundColor: '#ffffff',
  },
});
