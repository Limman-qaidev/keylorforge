import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { RequireAuthenticated } from '@/components/auth/auth-guards';
import { ExerciseCatalogScreen } from '@/components/exercises/exercise-catalog-screen';
import { AuthenticatedShell } from '@/components/navigation/authenticated-shell';
import { FreeWorkoutExperience } from '@/components/workouts/free-workout-experience';

/**
 * A deliberately explicit, development-only preview. The ordinary Entrenar
 * route remains the canonical catalogue in every production build.
 * The QA preview has a DIFFERENT SQLite file and never starts remote sync.
 */
export default function TrainRoute() {
  const [preview, setPreview] = useState(false);
  const canPreview = __DEV__ && Platform.OS !== 'web';
  return (
    <RequireAuthenticated>
      <AuthenticatedShell activeDestination="train">
        {canPreview ? (
          <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPreview((current) => !current)}
              style={{ padding: 12, alignItems: 'center' }}
            >
              <Text>
                {preview
                  ? 'Volver al catálogo'
                  : 'Probar entrenamiento (datos aislados)'}
              </Text>
            </Pressable>
          </View>
        ) : null}
        {canPreview && preview ? (
          <FreeWorkoutExperience isolatedPreview />
        ) : (
          <ExerciseCatalogScreen />
        )}
      </AuthenticatedShell>
    </RequireAuthenticated>
  );
}
