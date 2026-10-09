import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RequireAuthenticated } from '@/components/auth/auth-guards';
import { ExerciseCatalogScreen } from '@/components/exercises/exercise-catalog-screen';
import { AuthenticatedShell } from '@/components/navigation/authenticated-shell';

function TrainCatalogue() {
  const router = useRouter();
  return (
    <View style={styles.root}>
      <Pressable
        accessibilityLabel="Abrir catálogo sin conexión"
        accessibilityRole="button"
        onPress={() => router.push('/offline-exercises')}
        style={styles.offlineLink}
      >
        <Text style={styles.offlineLinkText}>
          Consultar ejercicios sin conexión
        </Text>
        <Text accessible={false} style={styles.chevron}>
          ›
        </Text>
      </Pressable>
      <ExerciseCatalogScreen />
    </View>
  );
}

export default function TrainRoute() {
  return (
    <RequireAuthenticated>
      <AuthenticatedShell activeDestination="train">
        <TrainCatalogue />
      </AuthenticatedShell>
    </RequireAuthenticated>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  offlineLink: {
    alignItems: 'center',
    backgroundColor: '#eaf1ff',
    borderBottomColor: '#d6e3ff',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 50,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  offlineLinkText: { color: '#075bff', fontSize: 14, fontWeight: '700' },
  chevron: { color: '#075bff', fontSize: 23 },
});
