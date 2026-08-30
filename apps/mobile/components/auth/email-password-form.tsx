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
          <TextInput
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onBlur={onBlur}
            onChangeText={onChange}
            style={authScreenStyles.input}
            textContentType="emailAddress"
            value={value}
          />
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
          <TextInput
            accessibilityLabel="Password"
            autoComplete="password"
            onBlur={onBlur}
            onChangeText={onChange}
            secureTextEntry
            style={authScreenStyles.input}
            textContentType="password"
            value={value}
          />
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
  fieldError: { color: '#b42318', fontSize: 14, marginTop: 6 },
});
