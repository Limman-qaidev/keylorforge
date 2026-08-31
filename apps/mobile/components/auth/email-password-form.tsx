import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { ErrorMessage, FieldLabel, FormInput } from '@/components/ui/form';
import { spacing } from '@/components/ui/tokens';

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
      <FieldLabel>Email</FieldLabel>
      <Controller
        control={control}
        name="email"
        render={({ field: { onBlur, onChange, value } }) => (
          <FormInput
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onBlur={onBlur}
            onChangeText={onChange}
            textContentType="emailAddress"
            value={value}
          />
        )}
      />
      {errors.email ? (
        <ErrorMessage>{errors.email.message}</ErrorMessage>
      ) : null}

      <FieldLabel>Password</FieldLabel>
      <Controller
        control={control}
        name="password"
        render={({ field: { onBlur, onChange, value } }) => (
          <FormInput
            accessibilityLabel="Password"
            autoComplete="password"
            onBlur={onBlur}
            onChangeText={onChange}
            secureTextEntry
            textContentType="password"
            value={value}
          />
        )}
      />
      {errors.password ? (
        <ErrorMessage>{errors.password.message}</ErrorMessage>
      ) : null}

      {submissionError ? <ErrorMessage>{submissionError}</ErrorMessage> : null}
      <View style={styles.button}>
        <Button
          disabled={isSubmitting}
          loading={isSubmitting}
          onPress={handleSubmit(submit)}
          label={isSubmitting ? 'Please wait…' : actionLabel}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { marginTop: spacing.xl },
});
