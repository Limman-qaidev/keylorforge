/** One-button Android QA: explicit, isolated and never part of product training. */
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { RequireAuthenticated } from '@/components/auth/auth-guards';
import { AuthenticatedShell } from '@/components/navigation/authenticated-shell';
import { useAuth } from '@/lib/auth/auth-provider';
import { getSupabaseClient } from '@/lib/auth/supabase';
import { runIsolatedM3TransportQa } from '@/lib/workouts/remote-e2e-qa';
import type { StartSyncAccess } from '@/lib/workouts/start-session-sync';

function RemoteM3QaScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const subjectRef = useRef<string | null>(null);
  subjectRef.current = session?.user.id ?? null;
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(
    'Sin ejecutar. Solo usa una SQLite QA nueva y PostgreSQL keylorforge_m3_e2e.',
  );
  const access = useMemo<StartSyncAccess>(
    () => ({
      currentAuthenticatedSubject: () => subjectRef.current,
      acquireCurrentCredentials: async () => {
        const subject = subjectRef.current;
        if (!subject) return null;
        const { data, error } = await getSupabaseClient().auth.getSession();
        if (
          error ||
          subjectRef.current !== subject ||
          data.session?.user.id !== subject
        ) {
          return null;
        }
        return {
          subject,
          accessToken: data.session.access_token,
        };
      },
    }),
    [],
  );

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await runIsolatedM3TransportQa(access, setFeedback);
      setFeedback(
        'PASS · START + SET + FINISH sincronizados · 3 ACK · ' +
          '1 serie · sesión ' +
          result.sessionId,
      );
    } catch (error) {
      setFeedback(
        'DETENIDA (sin borrar datos): ' +
          (error instanceof Error ? error.message : String(error)) +
          '. Puedes pulsar de nuevo para reanudar.',
      );
    } finally {
      setBusy(false);
    }
  };

  if (!__DEV__ || Platform.OS === 'web') {
    return <Text>Diagnóstico no disponible fuera de Android DEV.</Text>;
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>QA M3 · Sincronización REAL</Text>
      <Text style={styles.description}>
        Prueba nueva e independiente: Android SQLite QA → FastAPI :8001 →
        PostgreSQL keylorforge_m3_e2e → ACK. No accede a los entrenamientos
        anteriores ni a las pantallas de datos aislados.
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void run()}
        style={[styles.button, busy && styles.disabled]}
      >
        <Text style={styles.buttonText}>
          {busy ? 'Ejecutando…' : 'Ejecutar START → SET → FINISH → ACK'}
        </Text>
      </Pressable>
      <Text accessibilityLiveRegion="polite" selectable style={styles.status}>
        {feedback}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.replace('/home')}
        style={styles.back}
      >
        <Text>Volver a Inicio</Text>
      </Pressable>
    </ScrollView>
  );
}

export default function RemoteM3QaRoute() {
  return (
    <RequireAuthenticated>
      <AuthenticatedShell activeDestination="train">
        <RemoteM3QaScreen />
      </AuthenticatedShell>
    </RequireAuthenticated>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: 24, gap: 20, backgroundColor: '#f6f8fc' },
  title: { fontSize: 24, fontWeight: '800', color: '#12213a' },
  description: { fontSize: 15, lineHeight: 22, color: '#526074' },
  button: {
    backgroundColor: '#075bff',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  status: { fontSize: 15, lineHeight: 22, color: '#12213a' },
  back: { padding: 16, alignItems: 'center' },
});
