import { requestApi } from './client';

export type HealthResponse = {
  status: 'ok';
};

/**
 * Reads the stable development health contract exposed by the FastAPI service.
 */
export async function getHealth(): Promise<HealthResponse> {
  const response = await requestApi('/health');

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
}
