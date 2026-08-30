import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type AuthScreenProps = PropsWithChildren<{
  subtitle?: string;
  title: string;
}>;

export function AuthScreen({ children, subtitle, title }: AuthScreenProps) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.brand}>
          KeylorFit
        </Text>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
      </View>
    </View>
  );
}

export const authScreenStyles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#275dad',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  error: { color: '#b42318', fontSize: 14, marginTop: 12 },
  input: {
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
    marginTop: 16,
  },
  link: { color: '#1d4f91', fontSize: 16, fontWeight: '600', marginTop: 20 },
});

const styles = StyleSheet.create({
  brand: {
    color: '#275dad',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 28,
  },
  container: {
    backgroundColor: '#f7f9fc',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  content: { width: '100%' },
  subtitle: { color: '#4d5d74', fontSize: 16, lineHeight: 23, marginTop: 8 },
  title: { color: '#101b2d', fontSize: 30, fontWeight: '700' },
});
