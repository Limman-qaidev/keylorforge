import { requestApi } from '../client';
import { getHealth, HEALTH_REQUEST_TIMEOUT_MS } from '../health';

jest.mock('../client', () => ({
  requestApi: jest.fn(),
}));

describe('health API client', () => {
  beforeEach(() => {
    jest.mocked(requestApi).mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses the shared request abstraction for the stable health contract', async () => {
    jest.mocked(requestApi).mockResolvedValue({
      json: async () => ({ status: 'ok' }),
      ok: true,
      status: 200,
    } as Response);

    await expect(getHealth()).resolves.toEqual({ status: 'ok' });
    expect(requestApi).toHaveBeenCalledWith('/health', {
      signal: expect.any(AbortSignal),
    });
  });

  it('rejects non-success health responses', async () => {
    jest.mocked(requestApi).mockResolvedValue({
      json: async () => ({ status: 'error' }),
      ok: false,
      status: 503,
    } as Response);

    await expect(getHealth()).rejects.toThrow(
      'Health request failed with HTTP 503.',
    );
  });

  it('rejects an invalid health payload', async () => {
    jest.mocked(requestApi).mockResolvedValue({
      json: async () => ({ status: 'degraded' }),
      ok: true,
      status: 200,
    } as Response);

    await expect(getHealth()).rejects.toThrow(
      'Health response did not match the expected contract.',
    );
  });

  it('aborts an unreachable request and reports a readable timeout', async () => {
    jest.useFakeTimers();
    let requestSignal: AbortSignal | undefined;

    jest.mocked(requestApi).mockImplementation((_path, init) => {
      requestSignal = init?.signal ?? undefined;

      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener(
          'abort',
          () => reject(new Error('The fetch request was aborted.')),
          { once: true },
        );
      });
    });

    const healthRequest = getHealth();
    const timeoutExpectation = expect(healthRequest).rejects.toThrow(
      'Health request timed out.',
    );

    await jest.advanceTimersByTimeAsync(HEALTH_REQUEST_TIMEOUT_MS);

    expect(requestSignal?.aborted).toBe(true);
    await timeoutExpectation;
    expect(jest.getTimerCount()).toBe(0);
  });
});
