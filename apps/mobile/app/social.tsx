import { RequireAuthenticated } from '@/components/auth/auth-guards';
import { AuthenticatedShell } from '@/components/navigation/authenticated-shell';
import { EmptyDestination } from '@/components/navigation/empty-destination';

export default function SocialRoute() {
  return (
    <RequireAuthenticated>
      <AuthenticatedShell activeDestination="social">
        <EmptyDestination
          eyebrow="KEYLORFORGE · SOCIAL"
          message="La experiencia social aparecerá aquí cuando existan funciones reales de amigos, retos o rankings."
          title="Social"
        />
      </AuthenticatedShell>
    </RequireAuthenticated>
  );
}
