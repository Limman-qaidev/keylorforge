import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';

import { AuthProvider } from '@/lib/auth/auth-provider';
import { RecoveryLinkProvider } from '@/lib/auth/recovery-link-provider';

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RecoveryLinkProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </RecoveryLinkProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
