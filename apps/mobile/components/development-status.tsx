import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getApiBaseUrl } from '@/lib/api/client';
import { getHealth, type HealthResponse } from '@/lib/api/health';

type HealthState =
  | { kind: 'loading' }
  | { kind: 'healthy' }
  | { kind: 'error'; message: string };

type DevelopmentStatusProps = {
  loadHealth?: () => Promise<HealthResponse>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to reach the API.';
}

function readApiConfiguration(): {
  apiBaseUrl?: string;
  error?: string;
} {
  try {
    return { apiBaseUrl: getApiBaseUrl() };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export function DevelopmentStatus({
  loadHealth = getHealth,
}: DevelopmentStatusProps) {
  const [healthState, setHealthState] = useState<HealthState>({
    kind: 'loading',
  });
  const apiConfiguration = readApiConfiguration();

  useEffect(() => {
    let active = true;

    if (apiConfiguration.error) {
      return () => {
        active = false;
      };
    }

    void loadHealth()
      .then(() => {
        if (active) {
          setHealthState({ kind: 'healthy' });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setHealthState({ kind: 'error', message: errorMessage(error) });
        }
      });

    return () => {
      active = false;
    };
  }, [apiConfiguration.error, loadHealth]);

  const visibleHealthState: HealthState = apiConfiguration.error
    ? { kind: 'error', message: apiConfiguration.error }
    : healthState;

  return (
    <View style={styles.container} accessibilityRole="summary">
      <Text style={styles.heading}>Keylornet mobile</Text>
      {visibleHealthState.kind === 'loading' ? (
        <Text accessibilityLiveRegion="polite" style={styles.message}>
          Checking API health…
        </Text>
      ) : null}
      {visibleHealthState.kind === 'healthy' ? (
        <Text accessibilityLiveRegion="polite" style={styles.message}>
          API is healthy.
        </Text>
      ) : null}
      {visibleHealthState.kind === 'error' ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          API health check failed: {visibleHealthState.message}
        </Text>
      ) : null}
      <Text style={styles.endpoint} selectable>
        API base URL: {apiConfiguration.apiBaseUrl ?? 'Not configured'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  heading: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    marginBottom: 8,
  },
  error: {
    color: '#b00020',
    fontSize: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  endpoint: {
    fontSize: 14,
    textAlign: 'center',
  },
});
