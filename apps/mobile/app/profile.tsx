import { RequireAuthenticated } from '@/components/auth/auth-guards';
import { AuthenticatedShell } from '@/components/navigation/authenticated-shell';
import { ProfileScreen } from '@/components/profile/profile-screen';

export default function ProfileRoute() {
  return (
    <RequireAuthenticated>
      <AuthenticatedShell activeDestination="profile">
        <ProfileScreen />
      </AuthenticatedShell>
    </RequireAuthenticated>
  );
}
