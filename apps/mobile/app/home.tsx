import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { RequireAuthenticated } from '@/components/auth/auth-guards';
import { KeylorForgeG4Mark } from '@/components/brand/keylorforge-g4-mark';
import { AuthenticatedShell } from '@/components/navigation/authenticated-shell';
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
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.container}
    >
      <View style={styles.topRow}>
        <View>
          <Text style={styles.eyebrow}>KEYLORFORGE</Text>
          <Text accessibilityRole="header" style={styles.title}>
            Tu espacio de entrenamiento
          </Text>
        </View>
        <View accessibilityLabel="KeylorForge" style={styles.avatar}>
          <KeylorForgeG4Mark size={26} />
        </View>
      </View>

      <View style={styles.heroSurface}>
        <View style={styles.heroAccent} />
        <Text style={styles.heroEyebrow}>INICIO</Text>
        <Text style={styles.heroTitle}>Todo empieza con tu próximo paso.</Text>
        <Text style={styles.heroMessage}>
          Cuando el entrenamiento esté disponible, podrás iniciarlo desde aquí
          sin perder el foco.
        </Text>
        <Link asChild href="/train">
          <Pressable
            accessibilityLabel="Ir a Entrenar"
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>IR A ENTRENAR</Text>
            <Text accessible={false} style={styles.primaryButtonArrow}>
              →
            </Text>
          </Pressable>
        </Link>
      </View>

      <View style={styles.sectionHeader}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Tu actividad
        </Text>
        <View style={styles.sectionLine} />
      </View>
      <View style={styles.emptyActivity}>
        <View style={styles.activityIcon}>
          <Text accessible={false} style={styles.activityIconText}>
            ↗
          </Text>
        </View>
        <View style={styles.activityCopy}>
          <Text style={styles.activityTitle}>
            Lista para cuando tú lo estés
          </Text>
          <Text style={styles.activityMessage}>
            Aún no hay actividad disponible para mostrar.
          </Text>
        </View>
      </View>

      <Link asChild href="/profile">
        <Pressable
          accessibilityLabel="Abrir perfil"
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.profileLink,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.profileLinkIcon}>
            <Text accessible={false} style={styles.profileLinkIconText}>
              ◯
            </Text>
          </View>
          <Text style={styles.profileLinkText}>Gestionar perfil</Text>
          <Text accessible={false} style={styles.profileLinkArrow}>
            ›
          </Text>
        </Pressable>
      </Link>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={onSignOut}
        style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
      >
        <Text style={styles.signOutText}>Cerrar sesión</Text>
      </Pressable>
    </ScrollView>
  );
}

export default function HomeRoute() {
  return (
    <RequireAuthenticated>
      <AuthenticatedShell activeDestination="home">
        <HomeScreen />
      </AuthenticatedShell>
    </RequireAuthenticated>
  );
}

const styles = StyleSheet.create({
  activityCopy: { flex: 1, marginLeft: 14 },
  activityIcon: {
    alignItems: 'center',
    backgroundColor: '#eaf1ff',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  activityIconText: {
    color: '#075bff',
    fontSize: 23,
    fontWeight: '700',
    lineHeight: 26,
  },
  activityMessage: {
    color: '#66758c',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 3,
  },
  activityTitle: { color: '#1a2942', fontSize: 15, fontWeight: '700' },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#12213a',
    borderRadius: 23,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  container: { backgroundColor: '#f6f8fc', flex: 1 },
  content: { padding: 24, paddingBottom: 30 },
  emptyActivity: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e3e9f3',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 12,
    padding: 16,
  },
  error: { color: '#b42318', fontSize: 14, marginTop: 16 },
  eyebrow: {
    color: '#075bff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  heroAccent: {
    backgroundColor: '#1bc6bb',
    borderRadius: 3,
    height: 5,
    width: 48,
  },
  heroEyebrow: {
    color: '#8db5ff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 20,
  },
  heroMessage: {
    color: '#d5e2ff',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  heroSurface: {
    backgroundColor: '#12213a',
    borderRadius: 22,
    marginTop: 26,
    overflow: 'hidden',
    padding: 22,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 32,
    marginTop: 7,
    maxWidth: 300,
  },
  pressed: { opacity: 0.7 },
  profileLink: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e3e9f3',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 24,
    minHeight: 64,
    paddingHorizontal: 16,
  },
  profileLinkArrow: {
    color: '#526074',
    fontSize: 28,
    fontWeight: '400',
    marginLeft: 10,
  },
  profileLinkIcon: {
    alignItems: 'center',
    backgroundColor: '#edf2f8',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  profileLinkIconText: { color: '#1a2942', fontSize: 17, fontWeight: '800' },
  profileLinkText: {
    color: '#1a2942',
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 12,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#075bff',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 22,
    minHeight: 52,
    paddingHorizontal: 18,
  },
  primaryButtonArrow: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 10,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', marginTop: 30 },
  sectionLine: {
    backgroundColor: '#dce5f4',
    flex: 1,
    height: 1,
    marginLeft: 12,
  },
  sectionTitle: { color: '#1a2942', fontSize: 18, fontWeight: '800' },
  signOut: {
    alignSelf: 'center',
    marginTop: 20,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  signOutText: { color: '#526074', fontSize: 14, fontWeight: '700' },
  title: {
    color: '#12213a',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 5,
  },
  topRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
