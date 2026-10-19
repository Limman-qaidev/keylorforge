import { requestApi } from '@/lib/api/client';
import { confirmIsolatedQaWorkoutTarget } from '../qa-real-preflight';
import { isIsolatedRealWorkoutQa } from '../qa-real-config';

jest.mock('@/lib/api/client', () => ({ requestApi: jest.fn() }));
jest.mock('../qa-real-config', () => ({
  isIsolatedRealWorkoutQa: jest.fn(() => true),
  M3_QA_DATABASE: 'keylorforge_m3_e2e',
}));

const accepted = {
  status: 200,
  json: async () => ({
    ready: true,
    database: 'keylorforge_m3_e2e',
    exercises: 899,
  }),
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(isIsolatedRealWorkoutQa).mockReturnValue(true);
  jest.mocked(requestApi).mockResolvedValue(accepted as Response);
});

it('checks the authenticated QA DB before allowing a mutation', async () => {
  expect(await confirmIsolatedQaWorkoutTarget('qa-token')).toBe(true);
  expect(requestApi).toHaveBeenCalledWith(
    '/_qa/m3-ready',
    expect.objectContaining({
      headers: { Authorization: 'Bearer qa-token' },
      signal: expect.any(AbortSignal),
    }),
  );
});

it('fails closed on wrong Android package, missing token or unsafe database', async () => {
  jest.mocked(isIsolatedRealWorkoutQa).mockReturnValue(false);
  expect(await confirmIsolatedQaWorkoutTarget('qa-token')).toBe(false);
  jest.mocked(isIsolatedRealWorkoutQa).mockReturnValue(true);
  expect(await confirmIsolatedQaWorkoutTarget('')).toBe(false);
  jest.mocked(requestApi).mockResolvedValue({
    status: 200,
    json: async () => ({
      ready: true,
      database: 'keylorforge_production',
      exercises: 899,
    }),
  } as Response);
  expect(await confirmIsolatedQaWorkoutTarget('qa-token')).toBe(false);
  expect(requestApi).toHaveBeenCalledTimes(1);
});

it.each([401, 403, 404, 409, 500])(
  'refuses remote sync on HTTP %i',
  async (status) => {
    jest.mocked(requestApi).mockResolvedValue({ status } as Response);
    expect(await confirmIsolatedQaWorkoutTarget('qa-token')).toBe(false);
  },
);

it('leaves the outbox alone on network failure or malformed receipt', async () => {
  jest.mocked(requestApi).mockRejectedValueOnce(new Error('offline'));
  expect(await confirmIsolatedQaWorkoutTarget('qa-token')).toBe(false);
  jest.mocked(requestApi).mockResolvedValueOnce({
    status: 200,
    json: async () => ({ ready: true, exercises: 899 }),
  } as Response);
  expect(await confirmIsolatedQaWorkoutTarget('qa-token')).toBe(false);
});
