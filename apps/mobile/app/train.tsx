import { useCallback, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { RequireAuthenticated } from '@/components/auth/auth-guards';
import { ExerciseCatalogScreen } from '@/components/exercises/exercise-catalog-screen';
import { AuthenticatedShell } from '@/components/navigation/authenticated-shell';
import {
  FreeWorkoutExperience,
  type WorkoutChrome,
} from '@/components/workouts/free-workout-experience';
import { isIsolatedRealWorkoutQa } from '@/lib/workouts/qa-real-config';

/**
 * A deliberately explicit, development-only preview. The ordinary Entrenar
 * route remains the canonical catalogue in ordinary production builds.
 * Only the separately installed QA release mounts the real workout lifecycle.
 * The DEV preview retains a separate SQLite and never starts remote sync.
 */
export default function TrainRoute() {
  const [previewMode, setPreviewMode] = useState<'workout' | 'history' | null>(
    null,
  );
  const preview = previewMode !== null;
  const canPreview = __DEV__ && Platform.OS !== 'web';
  const realQaWorkout = isIsolatedRealWorkoutQa();
  const [chrome, setChrome] = useState<WorkoutChrome>({
    immersive: false,
    dark: false,
  });
  const updateChrome = useCallback((next: WorkoutChrome) => {
    setChrome((previous) =>
      previous.immersive === next.immersive && previous.dark === next.dark
        ? previous
        : next,
    );
  }, []);
  return (
    <RequireAuthenticated>
      <AuthenticatedShell
        activeDestination="train"
        immersive={chrome.immersive}
        darkChrome={chrome.dark}
      >
        {canPreview && !realQaWorkout ? (
          <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                setPreviewMode((current) =>
                  current === null ? 'workout' : null,
                )
              }
              style={{ padding: 12, alignItems: 'center' }}
            >
              <Text>
                {preview
                  ? 'Volver al catálogo'
                  : 'Probar entrenamiento (datos aislados)'}
              </Text>
            </Pressable>
            {!preview ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setPreviewMode('history')}
                style={{ padding: 12, alignItems: 'center' }}
              >
                <Text>Ver historial (datos aislados)</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {realQaWorkout ? (
          <FreeWorkoutExperience onChromeChange={updateChrome} />
        ) : canPreview && preview ? (
          <FreeWorkoutExperience
            isolatedPreview
            initialMode={previewMode === 'history' ? 'history' : 'catalogue'}
            onChromeChange={updateChrome}
          />
        ) : (
          <ExerciseCatalogScreen />
        )}
      </AuthenticatedShell>
    </RequireAuthenticated>
  );
}
