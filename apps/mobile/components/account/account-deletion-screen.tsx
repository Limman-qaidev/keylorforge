import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '@/lib/auth/auth-provider';
import {
  AccountDeletionApiError,
  deleteCurrentAccount,
} from '@/lib/account/account-api';

type AuthenticatedRequestContext = {
  accessToken: string;
  invalidateSession: () => Promise<void>;
  refreshSession: () => Promise<string | null>;
};

async function deleteWithAuthRetry(
  context: AuthenticatedRequestContext,
): Promise<void> {
  try {
    await deleteCurrentAccount(context.accessToken);
  } catch (error) {
    if (!(error instanceof AccountDeletionApiError) || error.kind !== 'auth') {
      throw error;
    }

    let refreshedAccessToken: string | null;
    try {
      refreshedAccessToken = await context.refreshSession();
    } catch {
      throw new AccountDeletionApiError(
        'network',
        'We could not refresh your session. Check your connection and try again.',
      );
    }
    if (!refreshedAccessToken) {
      throw error;
    }

    try {
      await deleteCurrentAccount(refreshedAccessToken);
    } catch (retryError) {
      if (
        retryError instanceof AccountDeletionApiError &&
        retryError.kind === 'auth'
      ) {
        await context.invalidateSession();
      }
      throw retryError;
    }
  }
}

function feedbackFor(error: unknown): string {
  if (error instanceof AccountDeletionApiError) {
    return error.message;
  }
  return 'Account deletion could not be completed. Please try again.';
}

export function AccountDeletionScreen() {
  const { invalidateSession, refreshSession, session } = useAuth();
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accessToken = session?.access_token ?? null;
  const deletion = useMutation({
    mutationFn: async () => {
      if (!accessToken) {
        throw new AccountDeletionApiError(
          'auth',
          'Your session has ended. Please sign in again.',
        );
      }
      await deleteWithAuthRetry({
        accessToken,
        invalidateSession,
        refreshSession,
      });
      queryClient.removeQueries({ queryKey: ['current-profile'] });
      await invalidateSession();
    },
    retry: false,
  });

  const submit = async () => {
    setError(null);
    try {
      await deletion.mutateAsync();
    } catch (submissionError) {
      setError(feedbackFor(submissionError));
    }
  };

  const isDeleting = deletion.isPending;
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        Delete account
      </Text>
      <Text style={styles.message}>
        This permanently deletes your KeylorForge account and profile
        information.
      </Text>
      {!confirmed ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setConfirmed(true)}
          style={styles.dangerButton}
        >
          <Text style={styles.buttonText}>Delete account</Text>
        </Pressable>
      ) : (
        <>
          <Text accessibilityLiveRegion="polite" style={styles.warning}>
            This action cannot be undone.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: isDeleting, disabled: isDeleting }}
            disabled={isDeleting}
            onPress={() => void submit()}
            style={styles.dangerButton}
          >
            {isDeleting ? <ActivityIndicator color="#ffffff" /> : null}
            <Text style={styles.buttonText}>
              {isDeleting ? 'Deleting…' : 'Permanently delete account'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={isDeleting}
            onPress={() => setConfirmed(false)}
            style={styles.cancelButton}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </>
      )}
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={isDeleting}
        onPress={() => router.back()}
        style={styles.backButton}
      >
        <Text style={styles.cancelText}>Back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: { marginTop: 20, minHeight: 44, paddingVertical: 12 },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  cancelButton: { marginTop: 12, minHeight: 44, paddingVertical: 12 },
  cancelText: {
    color: '#1d4f91',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  container: { backgroundColor: '#f7f9fc', flex: 1, padding: 24 },
  dangerButton: {
    backgroundColor: '#b42318',
    borderRadius: 8,
    marginTop: 28,
    minHeight: 48,
    justifyContent: 'center',
    padding: 14,
  },
  error: { color: '#b42318', fontSize: 14, marginTop: 16 },
  message: { color: '#4d5d74', fontSize: 16, lineHeight: 23, marginTop: 12 },
  title: { color: '#101b2d', fontSize: 30, fontWeight: '700' },
  warning: { color: '#8a2a0a', fontSize: 16, fontWeight: '600', marginTop: 24 },
});
