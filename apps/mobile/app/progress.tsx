import { RequireAuthenticated } from '@/components/auth/auth-guards';
import { AuthenticatedShell } from '@/components/navigation/authenticated-shell';
import { EmptyDestination } from '@/components/navigation/empty-destination';

export default function ProgressRoute() {
  return (
    <RequireAuthenticated>
      <AuthenticatedShell activeDestination="progress">
        <EmptyDestination
          eyebrow="KEYLORFORGE · PROGRESO"
          message="Aquí verás tu evolución cuando la fase de progreso incorpore métricas reales de entrenamiento."
          title="Progreso"
        />
      </AuthenticatedShell>
    </RequireAuthenticated>
  );
}
