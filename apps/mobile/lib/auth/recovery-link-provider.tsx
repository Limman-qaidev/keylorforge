import * as Linking from 'expo-linking';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { RECOVERY_CALLBACK_URL } from '@/lib/auth/recovery-callback';

type RecoveryLinkContextValue = {
  clearRecoveryLink: (url: string) => void;
  recoveryUrl: string | null;
};

const RecoveryLinkContext = createContext<RecoveryLinkContextValue | undefined>(
  undefined,
);

function isRecoveryEndpoint(url: string): boolean {
  try {
    const parsed = new URL(url);
    const expected = new URL(RECOVERY_CALLBACK_URL);

    return (
      parsed.protocol === expected.protocol &&
      parsed.hostname === expected.hostname &&
      parsed.pathname === expected.pathname
    );
  } catch {
    return false;
  }
}

/**
 * Keeps the latest recovery deep link above the router so route transitions
 * cannot miss a URL event while /auth/recovery is mounting.
 *
 * Recovery credentials live only in memory and are never logged or persisted.
 */
export function RecoveryLinkProvider({ children }: PropsWithChildren) {
  const [recoveryUrl, setRecoveryUrl] = useState<string | null>(null);

  useEffect(() => {
    const capture = (url: string | null) => {
      if (url && isRecoveryEndpoint(url)) {
        setRecoveryUrl(url);
      }
    };

    const subscription = Linking.addEventListener('url', ({ url }) => {
      capture(url);
    });

    capture(Linking.getLinkingURL());

    return () => subscription.remove();
  }, []);

  const clearRecoveryLink = useCallback((url: string) => {
    setRecoveryUrl((current) => (current === url ? null : current));

    if (Linking.getLinkingURL() === url) {
      Linking.clearInitialURL();
    }
  }, []);

  const value = useMemo(
    () => ({ clearRecoveryLink, recoveryUrl }),
    [clearRecoveryLink, recoveryUrl],
  );

  return (
    <RecoveryLinkContext.Provider value={value}>
      {children}
    </RecoveryLinkContext.Provider>
  );
}

export function useRecoveryLink(): RecoveryLinkContextValue {
  const value = useContext(RecoveryLinkContext);
  if (!value) {
    throw new Error(
      'useRecoveryLink must be rendered within RecoveryLinkProvider.',
    );
  }

  return value;
}
