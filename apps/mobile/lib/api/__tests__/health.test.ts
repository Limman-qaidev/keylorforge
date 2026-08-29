import { requestApi } from '../client';
import { getHealth } from '../health';

jest.mock('../client', () => ({
  requestApi: jest.fn(),
}));

describe('health API client', () => {
  beforeEach(() => {
    jest.mocked(requestApi).mockReset();
  });

  it('uses the shared request abstraction for the stable health contract', async () => {
    jest.mocked(requestApi).mockResolvedValue({
      json: async () => ({ status: 'ok' }),
      ok: true,
      status: 200,
    } as Response);

    await expect(getHealth()).resolves.toEqual({ status: 'ok' });
    expect(requestApi).toHaveBeenCalledWith('/health');
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
});
