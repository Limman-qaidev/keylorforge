import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { z } from 'zod';

import { authScreenStyles } from '@/components/auth/auth-screen';

const recoveryRequestSchema = z.object({
  email: z.email('Enter a valid email address.'),
});

type RecoveryRequestValues = z.infer<typeof recoveryRequestSchema>;

type RecoveryRequestFormProps = {
  onSubmit: (email: string) => Promise<{ error?: string }>;
};

export function RecoveryRequestForm({ onSubmit }: RecoveryRequestFormProps) {
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
  } = useForm<RecoveryRequestValues>({
    defaultValues: { email: '' },
    resolver: zodResolver(recoveryRequestSchema),
  });

  const submit = async ({ email }: RecoveryRequestValues) => {
    setSubmissionError(null);
    const result = await onSubmit(email);
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
              placeholderTextColor="#7f8b9d"
              returnKeyType="done"
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
          {isSubmitting ? 'Please wait…' : 'Send recovery code'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { marginTop: 22 },
  fieldError: { color: '#ff9b9b', fontSize: 14, lineHeight: 20, marginTop: 6 },
});
