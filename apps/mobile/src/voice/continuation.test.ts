import { ApiError } from '@konvami/api-client';
import { retryContinuation } from './continuation';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('retries a settling or interrupted request without replacing its attempt or offer', async () => {
  const request = jest
    .fn()
    .mockRejectedValueOnce(new ApiError('continuation_pending', 409))
    .mockRejectedValueOnce(new ApiError('network'))
    .mockResolvedValue('same answer');
  const work = retryContinuation(request, new AbortController().signal);
  await jest.advanceTimersByTimeAsync(2000);
  await expect(work).resolves.toBe('same answer');
  expect(request).toHaveBeenCalledTimes(3);
});

it('does not retry entitlement or consent refusals', async () => {
  const request = jest.fn().mockRejectedValue(new ApiError('consent_required', 403));
  await expect(retryContinuation(request, new AbortController().signal)).rejects.toMatchObject({
    code: 'consent_required',
  });
  expect(request).toHaveBeenCalledTimes(1);
});

it('cancels even when the network request never resolves', async () => {
  const cancel = new AbortController();
  const request = jest.fn(() => new Promise(() => {}));
  const work = retryContinuation(request, cancel.signal);
  const assertion = expect(work).rejects.toMatchObject({ code: 'stopped' });
  cancel.abort();
  await assertion;
  await jest.advanceTimersByTimeAsync(60000);
  expect(request).toHaveBeenCalledTimes(1);
});
