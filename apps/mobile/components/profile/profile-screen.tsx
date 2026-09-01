import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';

import { useAuth } from '@/lib/auth/auth-provider';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LoadingState } from '@/components/ui/feedback';
import { ErrorMessage, FieldLabel, FormInput } from '@/components/ui/form';
import { Screen } from '@/components/ui/screen';
import { colors, spacing, typography } from '@/components/ui/tokens';
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
      if (retryError instanceof ProfileApiError && retryError.kind === 'auth') {
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

  const profileMutation = useMutation<ProfileResponse, ProfileApiError, string>(
    {
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
    },
  );

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
      <Screen>
        <View style={styles.centered}>
          <ErrorMessage>
            Your session has ended. Please sign in again.
          </ErrorMessage>
        </View>
      </Screen>
    );
  }

  if (profileQuery.isPending) {
    return (
      <Screen>
        <LoadingState label="Loading profile…" />
      </Screen>
    );
  }

  if (profileQuery.isError && !profileQuery.data) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Text accessibilityRole="header" style={styles.title}>
            Profile
          </Text>
          <ErrorMessage>{feedbackFor(profileQuery.error)}</ErrorMessage>
          <View style={styles.button}>
            <Button
              loading={profileQuery.isFetching}
              onPress={() => {
                setSubmissionError(null);
                setSuccessMessage(null);
                void profileQuery.refetch();
              }}
            >
              Try again
            </Button>
          </View>
        </View>
      </Screen>
    );
  }

  const isSaving = isSubmitting || profileMutation.isPending;

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Avatar name={profileQuery.data?.profile.display_name} size={64} />
        <View>
          <Text accessibilityRole="header" style={styles.title}>
            Profile
          </Text>
          <Text style={styles.subtitle}>
            Choose the name shown with your KeylorFit account.
          </Text>
        </View>
      </View>

      <Card>
        <FieldLabel>Display name</FieldLabel>
        <Controller
          control={control}
          name="displayName"
          render={({ field: { onBlur, onChange, value } }) => (
            <FormInput
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
              textContentType="name"
              value={value}
            />
          )}
        />
        {errors.displayName ? (
          <ErrorMessage>{errors.displayName.message}</ErrorMessage>
        ) : null}
        {submissionError ? (
          <ErrorMessage>{submissionError}</ErrorMessage>
        ) : null}
        {successMessage ? (
          <Text accessibilityLiveRegion="polite" style={styles.success}>
            {successMessage}
          </Text>
        ) : null}

        <View style={styles.button}>
          <Button loading={isSaving} onPress={handleSubmit(saveProfile)}>
            Save profile
          </Button>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  button: { marginTop: spacing.xl },
  centered: { flex: 1, justifyContent: 'center' },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  subtitle: {
    color: colors.textMuted,
    marginTop: spacing.xs,
    ...typography.caption,
  },
  success: {
    color: colors.progress,
    marginTop: spacing.sm,
    ...typography.caption,
  },
  title: { color: colors.text, ...typography.title },
});
