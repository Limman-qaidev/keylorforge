import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useState } from 'react';
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

import {
  getCurrentProfile,
  ProfileApiError,
  updateCurrentProfile,
} from '@/lib/profile/profile-api';
import { useAuth } from '@/lib/auth/auth-provider';

const displayNameSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Enter a display name.')
    .max(80, 'Use 80 characters or fewer.'),
});

type DisplayNameValues = z.infer<typeof displayNameSchema>;

function feedbackFor(error: unknown): string {
  if (error instanceof ProfileApiError) {
    return error.message;
  }

  return 'Your profile could not be loaded. Please try again.';
}

export function ProfileScreen() {
  const { invalidateSession, session } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    reset,
  } = useForm<DisplayNameValues>({
    defaultValues: { displayName: '' },
    resolver: zodResolver(displayNameSchema),
  });

  const handleAuthFailure = useCallback(
    async (error: ProfileApiError): Promise<void> => {
      if (error.kind === 'auth') {
        await invalidateSession();
      }
    },
    [invalidateSession],
  );

  const loadProfile = useCallback(async () => {
    const accessToken = session?.access_token;
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    setSubmissionError(null);
    setSuccessMessage(null);

    try {
      const currentProfile = await getCurrentProfile(accessToken);
      reset({ displayName: currentProfile.profile.display_name ?? '' });
    } catch (error) {
      if (error instanceof ProfileApiError) {
        await handleAuthFailure(error);
      }
      setLoadError(feedbackFor(error));
    } finally {
      setIsLoading(false);
    }
  }, [handleAuthFailure, reset, session?.access_token]);

  useEffect(() => {
    let isCurrent = true;
    const accessToken = session?.access_token;

    const loadInitialProfile = async () => {
      if (!accessToken) {
        return;
      }

      try {
        const currentProfile = await getCurrentProfile(accessToken);
        if (isCurrent) {
          reset({ displayName: currentProfile.profile.display_name ?? '' });
        }
      } catch (error) {
        if (!isCurrent) {
          return;
        }

        if (error instanceof ProfileApiError) {
          await handleAuthFailure(error);
        }
        if (isCurrent) {
          setLoadError(feedbackFor(error));
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    };

    void loadInitialProfile();

    return () => {
      isCurrent = false;
    };
  }, [handleAuthFailure, reset, session?.access_token]);

  const saveProfile = async ({ displayName }: DisplayNameValues) => {
    const accessToken = session?.access_token;
    if (!accessToken) {
      setSubmissionError('Your session has ended. Please sign in again.');
      return;
    }

    setSubmissionError(null);
    setSuccessMessage(null);

    try {
      await updateCurrentProfile(accessToken, displayName);
      const persistedProfile = await getCurrentProfile(accessToken);
      reset({ displayName: persistedProfile.profile.display_name ?? '' });
      setSuccessMessage('Profile saved.');
    } catch (error) {
      if (error instanceof ProfileApiError) {
        await handleAuthFailure(error);
      }
      setSubmissionError(feedbackFor(error));
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator accessibilityLabel="Loading profile" />
        <Text style={styles.loadingText}>Loading profile…</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.centered}>
        <Text accessibilityRole="header" style={styles.title}>
          Profile
        </Text>
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {loadError}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void loadProfile()}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

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
            onChangeText={onChange}
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
        accessibilityState={{ busy: isSubmitting, disabled: isSubmitting }}
        disabled={isSubmitting}
        onPress={handleSubmit(saveProfile)}
        style={styles.button}
      >
        <Text style={styles.buttonText}>
          {isSubmitting ? 'Saving…' : 'Save profile'}
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
