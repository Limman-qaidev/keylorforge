import { RequireAuthenticated } from '@/components/auth/auth-guards';
import { AccountDeletionScreen } from '@/components/account/account-deletion-screen';

export default function DeleteAccountRoute() {
  return (
    <RequireAuthenticated>
      <AccountDeletionScreen />
    </RequireAuthenticated>
  );
}
