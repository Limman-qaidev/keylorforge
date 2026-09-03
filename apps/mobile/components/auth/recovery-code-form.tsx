import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { z } from 'zod';

import { authScreenStyles } from '@/components/auth/auth-screen';

const recoveryCodeSchema = z.object({
  code: z
    .string()
    .regex(/^\d{6}$/, 'Enter the 6-digit code from your email.'),
});

type RecoveryCodeValues = z.infer<typeof recoveryCodeSchema>;

type RecoveryCodeFormProps = {
  onSubmit: (code: string) => Promise<{ error?: string }>;
};

export function RecoveryCodeForm({ onSubmit }: RecoveryCodeFormProps) {
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
  } = useForm<RecoveryCodeValues>({
    defaultValues: { code: '' },
    resolver: zodResolver(recoveryCodeSchema),
  });

  const submit = async ({ code }: RecoveryCodeValues) => {
    setSubmissionError(null);
    const result = await onSubmit(code);
    setSubmissionError(result.error ?? null);
  };

  return (
    <View>
      <Text style={authScreenStyles.inputLabel}>Recovery code</Text>
      <Controller
        control={control}
        name="code"
        render={({ field: { onBlur, onChange, value } }) => (
          <View style={authScreenStyles.inputContainer}>
            <TextInput
              accessibilityLabel="Recovery code"
              autoComplete="one-time-code"
              keyboardType="number-pad"
              maxLength={6}
              onBlur={onBlur}
              onChangeText={onChange}
              placeholder="123456"
              placeholderTextColor="#7f8b9d"
              returnKeyType="done"
              style={authScreenStyles.input}
              textContentType="oneTimeCode"
              value={value}
            />
          </View>
        )}
      />
      {errors.code ? (
        <Text style={styles.fieldError}>{errors.code.message}</Text>
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
          {isSubmitting ? 'Please wait…' : 'Verify recovery code'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { marginTop: 22 },
  fieldError: { color: '#ff9b9b', fontSize: 14, lineHeight: 20, marginTop: 6 },
});
