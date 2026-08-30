import { Redirect } from 'expo-router';

import { SessionRestoring } from '@/components/auth/session-restoring';
import { useAuth } from '@/lib/auth/auth-provider';

export default function IndexRoute() {
  const { confirmationEmail, phase } = useAuth();

  if (phase === 'restoring') {
    return <SessionRestoring />;
  }

  if (phase === 'signedIn') {
    return <Redirect href="/home" />;
  }

  return <Redirect href={confirmationEmail ? '/confirmation' : '/welcome'} />;
}
