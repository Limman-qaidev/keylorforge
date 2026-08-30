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

type RequireSignedOutProps = PropsWithChildren<{
  allowConfirmationPending?: boolean;
}>;

/**
 * Keeps ordinary signed-out routes away from an unfinished email-confirmation
 * flow. The confirmation route opts in so it can render its pending state.
 */
export function RequireSignedOut({
  allowConfirmationPending = false,
  children,
}: RequireSignedOutProps) {
  const { confirmationEmail, phase } = useAuth();

  if (phase === 'restoring') {
    return <SessionRestoringScreen />;
  }

  if (phase === 'signedIn') {
    return <Redirect href="/home" />;
  }

  if (confirmationEmail && !allowConfirmationPending) {
    return <Redirect href="/confirmation" />;
  }

  return children;
}
