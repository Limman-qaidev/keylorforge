import { Redirect } from 'expo-router';
import type { PropsWithChildren } from 'react';

import { useAuth } from '@/lib/auth/auth-provider';

export function SessionRestoringScreen() {
  return <Redirect href="/restoring" />;
}

export function RequireAuthenticated({ children }: PropsWithChildren) {
  const { phase } = useAuth();

  if (phase === 'restoring') {
    return <SessionRestoringScreen />;
  }

  if (phase !== 'signedIn') {
    return <Redirect href="/welcome" />;
  }

  return children;
}

export function RequireSignedOut({ children }: PropsWithChildren) {
  const { confirmationEmail, phase } = useAuth();

  if (phase === 'restoring') {
    return <SessionRestoringScreen />;
  }

  if (phase === 'signedIn') {
    return <Redirect href="/home" />;
  }

  if (confirmationEmail) {
    return <Redirect href="/confirmation" />;
  }

  return children;
}
