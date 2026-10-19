/**
 * Authenticated, read-only fail-closed guard for QA workout sync.
 * Every pending mutation must verify the actual TEST PostgreSQL target.
 */
import { requestApi } from '@/lib/api/client';

import { isIsolatedRealWorkoutQa, M3_QA_DATABASE } from './qa-real-config';

const PREFLIGHT_TIMEOUT_MS = 8_000;

export async function confirmIsolatedQaWorkoutTarget(
  token: string,
): Promise<boolean> {
  if (!isIsolatedRealWorkoutQa() || !token) return false;
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), PREFLIGHT_TIMEOUT_MS);
  try {
    const response = await requestApi('/_qa/m3-ready', {
      headers: { Authorization: `Bearer ${token}` },
      signal: abort.signal,
    });
    if (response.status !== 200) return false;
    const payload: unknown = await response.json();
    if (
      payload === null ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    ) {
      return false;
    }
    const value = payload as Record<string, unknown>;
    return (
      value.ready === true &&
      value.database === M3_QA_DATABASE &&
      typeof value.exercises === 'number' &&
      Number.isSafeInteger(value.exercises) &&
      value.exercises > 0
    );
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
