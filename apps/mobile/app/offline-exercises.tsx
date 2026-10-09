import { RequireAuthenticated } from '@/components/auth/auth-guards';
import { OfflineExerciseBrowser } from '@/components/exercises/offline-exercise-browser';
import { AuthenticatedShell } from '@/components/navigation/authenticated-shell';

export default function OfflineExercisesRoute() {
  return (
    <RequireAuthenticated>
      <AuthenticatedShell activeDestination="train">
        <OfflineExerciseBrowser />
      </AuthenticatedShell>
    </RequireAuthenticated>
  );
}
