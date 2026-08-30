import { Stack } from 'expo-router';

import { AuthProvider } from '@/lib/auth/auth-provider';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}
