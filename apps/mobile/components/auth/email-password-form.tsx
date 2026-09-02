import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { z } from 'zod';

import { authScreenStyles } from '@/components/auth/auth-screen';

const emailPasswordSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(8, 'Use at least 8 characters.'),
});

type EmailPasswordValues = z.infer<typeof emailPasswordSchema>;

type EmailPasswordFormProps = {
  actionLabel: string;
  onSubmit: (values: EmailPasswordValues) => Promise<{ error?: string }>;
};

export function EmailPasswordForm({
  actionLabel,
  onSubmit,
}: EmailPasswordFormProps) {
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isPasswordVisible, setPasswordVisible] = useState(false);
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
  } = useForm<EmailPasswordValues>({
    defaultValues: { email: '', password: '' },
    resolver: zodResolver(emailPasswordSchema),
  });

  const submit = async (values: EmailPasswordValues) => {
    setSubmissionError(null);
    const result = await onSubmit(values);
    setSubmissionError(result.error ?? null);
  };

  return (
    <View>
      <Text style={authScreenStyles.inputLabel}>Email</Text>
      <Controller
        control={control}
        name="email"
        render={({ field: { onBlur, onChange, value } }) => (
          <View style={authScreenStyles.inputContainer}>
            <TextInput
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onBlur={onBlur}
              onChangeText={onChange}
              placeholder="you@email.com"
              placeholderTextColor="#8b96a7"
              style={authScreenStyles.input}
              textContentType="emailAddress"
              value={value}
            />
          </View>
        )}
      />
      {errors.email ? (
        <Text style={styles.fieldError}>{errors.email.message}</Text>
      ) : null}

      <Text style={authScreenStyles.inputLabel}>Password</Text>
      <Controller
        control={control}
        name="password"
        render={({ field: { onBlur, onChange, value } }) => (
          <View style={authScreenStyles.inputContainer}>
            <TextInput
              accessibilityLabel="Password"
              autoComplete="password"
              onBlur={onBlur}
              onChangeText={onChange}
              placeholder="Enter your password"
              placeholderTextColor="#8b96a7"
              secureTextEntry={!isPasswordVisible}
              style={authScreenStyles.input}
              textContentType="password"
              value={value}
            />
            <Pressable
              accessibilityLabel={
                isPasswordVisible ? 'Hide password' : 'Show password'
              }
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setPasswordVisible((visible) => !visible)}
              style={styles.visibilityButton}
            >
              <Text style={styles.visibilityButtonText}>
                {isPasswordVisible ? 'Hide' : 'Show'}
              </Text>
            </Pressable>
          </View>
        )}
      />
      {errors.password ? (
        <Text style={styles.fieldError}>{errors.password.message}</Text>
      ) : null}

      {submissionError ? (
        <Text accessibilityLiveRegion="polite" style={authScreenStyles.error}>
          {submissionError}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isSubmitting }}
        disabled={isSubmitting}
        onPress={handleSubmit(submit)}
        style={[authScreenStyles.button, styles.button]}
      >
        <Text style={authScreenStyles.buttonText}>
          {isSubmitting ? 'Please wait…' : actionLabel}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { marginTop: 24 },
  fieldError: { color: '#ff9b9b', fontSize: 14, lineHeight: 20, marginTop: 6 },
  visibilityButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 14,
  },
  visibilityButtonText: { color: '#aeb9c9', fontSize: 14, fontWeight: '700' },
});
