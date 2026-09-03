import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { z } from 'zod';

import { authScreenStyles } from '@/components/auth/auth-screen';

const newPasswordSchema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters.'),
    passwordConfirmation: z.string(),
  })
  .refine(
    ({ password, passwordConfirmation }) => password === passwordConfirmation,
    {
      message: 'Passwords do not match.',
      path: ['passwordConfirmation'],
    },
  );

type NewPasswordValues = z.infer<typeof newPasswordSchema>;

type NewPasswordFormProps = {
  onSubmit: (password: string) => Promise<{ error?: string }>;
};

export function NewPasswordForm({ onSubmit }: NewPasswordFormProps) {
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isPasswordVisible, setPasswordVisible] = useState(false);
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
  } = useForm<NewPasswordValues>({
    defaultValues: { password: '', passwordConfirmation: '' },
    resolver: zodResolver(newPasswordSchema),
  });

  const submit = async ({ password }: NewPasswordValues) => {
    setSubmissionError(null);
    const result = await onSubmit(password);
    setSubmissionError(result.error ?? null);
  };

  return (
    <View>
      <PasswordField
        accessibilityLabel="New password"
        control={control}
        error={errors.password?.message}
        isPasswordVisible={isPasswordVisible}
        label="New password"
        name="password"
        onToggleVisibility={() => setPasswordVisible((visible) => !visible)}
      />
      <PasswordField
        accessibilityLabel="Confirm new password"
        control={control}
        error={errors.passwordConfirmation?.message}
        isPasswordVisible={isPasswordVisible}
        label="Confirm new password"
        name="passwordConfirmation"
        onToggleVisibility={() => setPasswordVisible((visible) => !visible)}
      />
      <Text style={styles.hint}>
        Use a strong password. The server may require additional strength rules.
      </Text>
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
          {isSubmitting ? 'Please wait…' : 'Update password'}
        </Text>
      </Pressable>
    </View>
  );
}

type PasswordFieldProps = {
  accessibilityLabel: string;
  control: ReturnType<typeof useForm<NewPasswordValues>>['control'];
  error?: string;
  isPasswordVisible: boolean;
  label: string;
  name: 'password' | 'passwordConfirmation';
  onToggleVisibility: () => void;
};

function PasswordField({
  accessibilityLabel,
  control,
  error,
  isPasswordVisible,
  label,
  name,
  onToggleVisibility,
}: PasswordFieldProps) {
  return (
    <>
      <Text style={authScreenStyles.inputLabel}>{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field: { onBlur, onChange, value } }) => (
          <View style={authScreenStyles.inputContainer}>
            <TextInput
              accessibilityLabel={accessibilityLabel}
              autoComplete="new-password"
              onBlur={onBlur}
              onChangeText={onChange}
              placeholder="Enter your new password"
              placeholderTextColor="#7f8b9d"
              returnKeyType={name === 'password' ? 'next' : 'done'}
              secureTextEntry={!isPasswordVisible}
              style={authScreenStyles.input}
              textContentType="newPassword"
              value={value}
            />
            <Pressable
              accessibilityLabel={
                isPasswordVisible ? 'Hide passwords' : 'Show passwords'
              }
              accessibilityRole="button"
              hitSlop={8}
              onPress={onToggleVisibility}
              style={styles.visibilityButton}
            >
              <Text style={styles.visibilityButtonText}>
                {isPasswordVisible ? 'Hide' : 'Show'}
              </Text>
            </Pressable>
          </View>
        )}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  button: { marginTop: 22 },
  fieldError: { color: '#ff9b9b', fontSize: 14, lineHeight: 20, marginTop: 6 },
  hint: { color: '#aeb9c9', fontSize: 13, lineHeight: 18, marginTop: 10 },
  visibilityButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 58,
    paddingHorizontal: 12,
  },
  visibilityButtonText: { color: '#aeb9c9', fontSize: 14, fontWeight: '700' },
});
