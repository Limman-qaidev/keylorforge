import { RequireAuthenticated } from '@/components/auth/auth-guards';
import { ProfileScreen } from '@/components/profile/profile-screen';

export default function ProfileRoute() {
  return (
    <RequireAuthenticated>
      <ProfileScreen />
    </RequireAuthenticated>
  );
}
