/** Strict offline→online Android QA, separate SQLite and DEV-only screen. */
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { RequireAuthenticated } from '@/components/auth/auth-guards';
import { AuthenticatedShell } from '@/components/navigation/authenticated-shell';
import { useAuth } from '@/lib/auth/auth-provider';
import { getSupabaseClient } from '@/lib/auth/supabase';
import {
  prepareOfflineM3Qa,
  createOfflineM3Qa,
  reconcileOfflineM3Qa,
} from '@/lib/workouts/offline-e2e-qa';
import type { StartSyncAccess } from '@/lib/workouts/start-session-sync';

function OfflineM3QaScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const subject = session?.user.id ?? null;
  const subjectRef = useRef<string | null>(null);
  useEffect(() => {
    subjectRef.current = subject;
    return () => {
      subjectRef.current = null;
    };
  }, [subject]);
  const access = useMemo<StartSyncAccess>(
    () => ({
      currentAuthenticatedSubject: () => subjectRef.current,
      acquireCurrentCredentials: async () => {
        const current = subjectRef.current;
        if (!current) return null;
        const { data, error } = await getSupabaseClient().auth.getSession();
        if (error || subjectRef.current !== current || data.session?.user.id !== current) {
          return null;
        }
        return { subject: current, accessToken: data.session.access_token };
      },
    }),
    [],
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    'Paso 1 con API conectada. Paso 2 sin adb reverse 8001. Paso 3 tras reconectar.'
  );
  const run = async (phase: 'prepare' | 'offline' | 'reconnect') => {
    if (busy) return;
    setBusy(true);
    try {
      if (phase === 'prepare') {
        const id = await prepareOfflineM3Qa(access);
        setMessage('PREPARADA · ejercicio persistido en SQLite aislada · ' + id);
      } else if (phase === 'offline') {
        const result = await createOfflineM3Qa(access);
        setMessage('OFFLINE REAL · 3 pendientes · 0 envíos · sesión ' + result.sessionId);
      } else {
        const result = await reconcileOfflineM3Qa(access);
        setMessage('PASS · reconexión · 3 ACK · 1 serie · ' + result.sessionId);
      }
    } catch (error) {
      setMessage('DETENIDA sin borrar datos: ' +
        (error instanceof Error ? error.message : String(error)));
    } finally {
      setBusy(false);
    }
  };
  if (!__DEV__ || Platform.OS === 'web') {
    return <Text>Diagnóstico no disponible fuera de Android DEV.</Text>;
  }
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>QA M3 · Sin backend REAL</Text>
      <Text>Usa SQLite exclusiva y PostgreSQL keylorforge_m3_e2e. No modifica entrenamientos existentes.</Text>
      <Pressable disabled={busy} accessibilityRole="button" onPress={() => void run('prepare')} style={styles.button}>
        <Text style={styles.buttonText}>1 · Preparar online</Text>
      </Pressable>
      <Pressable disabled={busy} accessibilityRole="button" onPress={() => void run('offline')} style={styles.button}>
        <Text style={styles.buttonText}>2 · Crear entrenamiento SIN backend</Text>
      </Pressable>
      <Pressable disabled={busy} accessibilityRole="button" onPress={() => void run('reconnect')} style={styles.button}>
        <Text style={styles.buttonText}>3 · Sincronizar y verificar</Text>
      </Pressable>
      <Text accessibilityLiveRegion="polite" selectable>{message}</Text>
      <Pressable accessibilityRole="button" onPress={() => router.replace('/home')}>
        <Text>Volver a Inicio</Text>
      </Pressable>
    </ScrollView>
  );
}

export default function OfflineM3QaRoute() {
  return (
    <RequireAuthenticated>
      <AuthenticatedShell activeDestination="train">
        <OfflineM3QaScreen />
      </AuthenticatedShell>
    </RequireAuthenticated>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: 24, gap: 20, backgroundColor: '#f6f8fc' },
  title: { fontSize: 24, fontWeight: '800', color: '#12213a' },
  button: { backgroundColor: '#075bff', padding: 18, borderRadius: 12 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
