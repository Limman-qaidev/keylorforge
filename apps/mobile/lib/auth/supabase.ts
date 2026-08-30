import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type MobileSupabaseClient = Pick<SupabaseClient, 'auth'>;

type SupabaseConfiguration = {
  publishableKey: string;
  url: string;
};

let client: MobileSupabaseClient | undefined;

function readConfiguration(): SupabaseConfiguration {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      'Supabase is not configured. Add the public Supabase URL and publishable key to .env.',
    );
  }

  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'https:') {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL must use HTTPS.');
  }

  return { publishableKey, url: parsedUrl.toString().replace(/\/$/, '') };
}

/**
 * Returns the mobile Auth client only after public Expo configuration is present.
 *
 * Supabase Auth v2 uses its current lockless coordinator by default. We keep that
 * supported behaviour instead of opting into the deprecated `processLock` API.
 */
export function getSupabaseClient(): MobileSupabaseClient {
  if (!client) {
    const configuration = readConfiguration();
    client = createClient(configuration.url, configuration.publishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: true,
        storage: AsyncStorage,
      },
    });
  }

  return client;
}

export function resetSupabaseClientForTests(): void {
  client = undefined;
}
