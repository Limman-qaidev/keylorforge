import { RequireAuthenticated } from '@/components/auth/auth-guards';
import { AuthenticatedShell } from '@/components/navigation/authenticated-shell';
import { EmptyDestination } from '@/components/navigation/empty-destination';

export default function TrainRoute() {
  return (
    <RequireAuthenticated>
      <AuthenticatedShell activeDestination="train">
        <EmptyDestination
          eyebrow="KEYLORFORGE · ENTRENAR"
          message="Este será el punto de entrada para empezar, continuar y configurar entrenamientos cuando llegue su funcionalidad de dominio."
          title="Entrenar"
        />
      </AuthenticatedShell>
    </RequireAuthenticated>
  );
}
