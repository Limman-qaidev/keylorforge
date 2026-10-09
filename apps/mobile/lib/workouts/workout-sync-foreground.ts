/**
 * Foreground-only M3 sync retries. No background execution, data deletion,
 * connectivity badge, unbounded loop or additional native dependency.
 *
 * Mounts only in the staged Free Workout UX until safe Android QA. A pending
 * outbox is retried on mount, returning to the foreground, immediately
 * after a local mutation, and periodically while this screen is foregrounded.
 */
import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { getSupabaseClient } from '../auth/supabase';
import { openLocalWorkoutDatabase } from './expo-sqlite-adapter';
import { drainWorkoutSync } from './workout-sync-coordinator';
import type { StartSyncAccess } from './start-session-sync';

const FOREGROUND_RETRY_MS = 90_000;

export function useForegroundWorkoutSync(subject: string | null): () => void {
  const triggerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!subject || Platform.OS === 'web') return;
    let mounted = true;
    const access: StartSyncAccess = {
      currentAuthenticatedSubject: () => (mounted ? subject : null),
      acquireCurrentCredentials: async () => {
        if (!mounted) return null;
        try {
          const { data, error } = await getSupabaseClient().auth.getSession();
          if (error || !mounted || data.session?.user.id !== subject) return null;
          return {
            subject,
            accessToken: data.session.access_token,
          };
        } catch {
          return null;
        }
      },
    };

    const attempt = () => {
      if (!mounted || AppState.currentState !== 'active') return;
      void (async () => {
        try {
          const db = await openLocalWorkoutDatabase();
          if (!mounted || AppState.currentState !== 'active') return;
          // Recheck the auth boundary on every network operation. The
          // coordinator single-flight lock prevents concurrent draining.
          await drainWorkoutSync(db, access);
        } catch {
          // A transient error leaves every un-ACKed row on disk. The next
          // foreground/interval/user action will retry; no toast is shown.
        }
      })();
    };

    triggerRef.current = attempt;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') attempt();
    });
    const interval = setInterval(attempt, FOREGROUND_RETRY_MS);
    attempt();

    return () => {
      mounted = false;
      triggerRef.current = null;
      clearInterval(interval);
      subscription.remove();
    };
  }, [subject]);

  return useCallback(() => triggerRef.current?.(), []);
}
