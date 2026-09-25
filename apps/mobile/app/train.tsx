import { RequireAuthenticated } from '@/components/auth/auth-guards';
import { ExerciseCatalogScreen } from '@/components/exercises/exercise-catalog-screen';
import { AuthenticatedShell } from '@/components/navigation/authenticated-shell';

export default function TrainRoute() {
  return (
    <RequireAuthenticated>
      <AuthenticatedShell activeDestination="train">
        <ExerciseCatalogScreen />
      </AuthenticatedShell>
    </RequireAuthenticated>
  );
}
