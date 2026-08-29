import { requestApi } from './client';

export type HealthResponse = {
  status: 'ok';
};

export type HealthRequestOptions = {
  signal?: AbortSignal;
};

// A development endpoint should not leave the status screen loading forever
// when a LAN host becomes unreachable. This remains health-specific so future
// API endpoints can define their own timeout and retry behaviour.
export const HEALTH_REQUEST_TIMEOUT_MS = 5_000;

/**
 * Reads the stable development health contract exposed by the FastAPI service.
 */
export async function getHealth({
  signal,
}: HealthRequestOptions = {}): Promise<HealthResponse> {
  const controller = new AbortController();
  let timedOut = false;

  const cancelFromCaller = () => {
    controller.abort();
  };

  if (signal?.aborted) {
    cancelFromCaller();
  } else {
    signal?.addEventListener('abort', cancelFromCaller, { once: true });
  }

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, HEALTH_REQUEST_TIMEOUT_MS);

  try {
    const response = await requestApi('/health', { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`Health request failed with HTTP ${response.status}.`);
    }

    const payload: unknown = await response.json();

    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('status' in payload) ||
      payload.status !== 'ok'
    ) {
      throw new Error('Health response did not match the expected contract.');
    }

    return { status: 'ok' };
  } catch (error) {
    if (timedOut) {
      throw new Error('Health request timed out.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancelFromCaller);
  }
}
