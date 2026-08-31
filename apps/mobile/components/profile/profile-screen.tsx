import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { z } from 'zod';

import { useAuth } from '@/lib/auth/auth-provider';
import {
  getCurrentProfile,
  type CurrentProfile,
  ProfileApiError,
  type ProfileResponse,
  updateCurrentProfile,
} from '@/lib/profile/profile-api';

const displayNameSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Enter a display name.')
    .max(80, 'Use 80 characters or fewer.'),
});

type DisplayNameValues = z.infer<typeof displayNameSchema>;

type AuthenticatedRequestContext = {
  accessToken: string;
  invalidateSession: () => Promise<void>;
  refreshSession: () => Promise<string | null>;
};

function profileQueryKey(userId: string) {
  return ['current-profile', userId] as const;
}

function feedbackFor(error: unknown): string {
  if (error instanceof ProfileApiError) {
    return error.message;
  }

  return 'Your profile could not be loaded. Please try again.';
}

async function runWithAuthRetry<T>(
  operation: (accessToken: string) => Promise<T>,
  context: AuthenticatedRequestContext,
): Promise<T> {
  try {
    return await operation(context.accessToken);
  } catch (error) {
    if (!(error instanceof ProfileApiError) || error.kind !== 'auth') {
      throw error;
    }

    let refreshedAccessToken: string | null;
    try {
      refreshedAccessToken = await context.refreshSession();
    } catch {
      throw new ProfileApiError(
        'network',
        'We could not refresh your session. Check your connection and try again.',
      );
    }

    if (!refreshedAccessToken) {
      throw error;
    }

    try {
      return await operation(refreshedAccessToken);
    } catch (retryError) {
      if (
        retryError instanceof ProfileApiError &&
        retryError.kind === 'auth'
      ) {
        await context.invalidateSession();
      }
      throw retryError;
    }
  }
}

export function ProfileScreen() {
  const { invalidateSession, refreshSession, session } = useAuth();
  const queryClient = useQueryClient();
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const {
    control,
    formState: { errors, isDirty, isSubmitting },
    handleSubmit,
    reset,
  } = useForm<DisplayNameValues>({
    defaultValues: { displayName: '' },
    resolver: zodResolver(displayNameSchema),
  });

  const accessToken = session?.access_token ?? null;
  const userId = session?.user.id ?? null;
  const queryKey = profileQueryKey(userId ?? 'signed-out');

  const profileQuery = useQuery<CurrentProfile, ProfileApiError>({
    enabled: Boolean(accessToken && userId),
    queryKey,
    queryFn: async () => {
      if (!accessToken) {
        throw new ProfileApiError(
          'auth',
          'Your session has ended. Please sign in again.',
        );
      }

      return runWithAuthRetry(getCurrentProfile, {
        accessToken,
        invalidateSession,
        refreshSession,
      });
    },
    retry: false,
  });

  const profileMutation = useMutation<ProfileResponse, ProfileApiError, string>({
    mutationFn: async (displayName) => {
      if (!accessToken) {
        throw new ProfileApiError(
          'auth',
          'Your session has ended. Please sign in again.',
        );
      }

      return runWithAuthRetry(
        (token) => updateCurrentProfile(token, displayName),
        {
          accessToken,
          invalidateSession,
          refreshSession,
        },
      );
    },
    retry: false,
  });

  useEffect(() => {
    if (profileQuery.data && !isDirty) {
      reset({
        displayName: profileQuery.data.profile.display_name ?? '',
      });
    }
  }, [isDirty, profileQuery.data, reset]);

  const saveProfile = async ({ displayName }: DisplayNameValues) => {
    setSubmissionError(null);
    setSuccessMessage(null);

    try {
      const persistedProfile = await profileMutation.mutateAsync(displayName);
      queryClient.setQueryData<CurrentProfile>(queryKey, (currentProfile) => {
        if (!currentProfile) {
          return currentProfile;
        }
        return { ...currentProfile, profile: persistedProfile };
      });
      reset({ displayName: persistedProfile.display_name ?? '' });
      setSuccessMessage('Profile saved.');
    } catch (error) {
      setSubmissionError(feedbackFor(error));
    }
  };

  if (!accessToken || !userId) {
    return (
      <View style={styles.centered}>
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          Your session has ended. Please sign in again.
        </Text>
      </View>
    );
  }

  if (profileQuery.isPending) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator accessibilityLabel="Loading profile" />
        <Text style={styles.loadingText}>Loading profile…</Text>
      </View>
    );
  }

  if (profileQuery.isError && !profileQuery.data) {
    return (
      <View style={styles.centered}>
        <Text accessibilityRole="header" style={styles.title}>
          Profile
        </Text>
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {feedbackFor(profileQuery.error)}
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={profileQuery.isFetching}
          onPress={() => {
            setSubmissionError(null);
            setSuccessMessage(null);
            void profileQuery.refetch();
          }}
          style={styles.button}
        >
          <Text style={styles.buttonText}>
            {profileQuery.isFetching ? 'Retrying…' : 'Try again'}
          </Text>
        </Pressable>
      </View>
    );
  }

  const isSaving = isSubmitting || profileMutation.isPending;

  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        Profile
      </Text>
      <Text style={styles.subtitle}>
        Choose the name shown with your KeylorFit account.
      </Text>

      <Text style={styles.inputLabel}>Display name</Text>
      <Controller
        control={control}
        name="displayName"
        render={({ field: { onBlur, onChange, value } }) => (
          <TextInput
            accessibilityLabel="Display name"
            autoCapitalize="words"
            autoComplete="name"
            maxLength={80}
            onBlur={onBlur}
            onChangeText={(nextValue) => {
              setSubmissionError(null);
              setSuccessMessage(null);
              onChange(nextValue);
            }}
            returnKeyType="done"
            style={styles.input}
            textContentType="name"
            value={value}
          />
        )}
      />
      {errors.displayName ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {errors.displayName.message}
        </Text>
      ) : null}
      {submissionError ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {submissionError}
        </Text>
      ) : null}
      {successMessage ? (
        <Text accessibilityLiveRegion="polite" style={styles.success}>
          {successMessage}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ busy: isSaving, disabled: isSaving }}
        disabled={isSaving}
        onPress={handleSubmit(saveProfile)}
        style={styles.button}
      >
        <Text style={styles.buttonText}>
          {isSaving ? 'Saving…' : 'Save profile'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#275dad',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 48,
    paddingHorizontal: 16,
  },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  centered: { flex: 1, justifyContent: 'center', padding: 24 },
  container: { backgroundColor: '#f7f9fc', flex: 1, padding: 24 },
  error: { color: '#b42318', fontSize: 14, marginTop: 8 },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#8b9ab2',
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
    marginTop: 8,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  inputLabel: {
    color: '#24344d',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 28,
  },
  loadingText: { color: '#4d5d74', fontSize: 16, marginTop: 12 },
  subtitle: { color: '#4d5d74', fontSize: 16, lineHeight: 23, marginTop: 8 },
  success: { color: '#067647', fontSize: 14, marginTop: 8 },
  title: { color: '#101b2d', fontSize: 30, fontWeight: '700' },
});
