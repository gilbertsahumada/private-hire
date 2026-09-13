import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  api,
  ApiError,
  retryJobRead,
  jobReadMessage,
} from '../apps/web/src/components/api';

afterEach(() => vi.unstubAllGlobals());

describe('job read recovery', () => {
  it('bounds retries for temporary failures and excludes access and integrity errors', () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      expect(retryJobRead(0, new ApiError(status, 'OPERATION_PENDING'))).toBe(
        true,
      );
      expect(retryJobRead(2, new ApiError(status, 'OPERATION_PENDING'))).toBe(
        false,
      );
    }
    for (const status of [400, 401, 403, 404])
      expect(retryJobRead(0, new ApiError(status, 'DENIED'))).toBe(false);
    expect(retryJobRead(0, new ApiError(503, 'CHAIN_JOB_MISMATCH'))).toBe(
      false,
    );
    expect(retryJobRead(0, new DOMException('cancelled', 'AbortError'))).toBe(
      false,
    );
    expect(retryJobRead(0, new TypeError('Failed to fetch'))).toBe(true);
    expect(retryJobRead(0, new DOMException('timeout', 'TimeoutError'))).toBe(
      true,
    );
  });
  it('preserves HTTP status even when an upstream error response is HTML', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('<h1>Unavailable</h1>', { status: 503 }),
        ),
    );
    await expect(api('/api/jobs/test')).rejects.toMatchObject({
      status: 503,
      code: 'INVALID_RESPONSE',
    });
  });
  it('never repeats a failed write', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: 'OPERATION_PENDING' }, { status: 503 }),
      );
    vi.stubGlobal('fetch', fetcher);
    await expect(
      api('/api/jobs/test/prepare', { action: 'pay' }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('explains expired sessions without exposing internal error content', () => {
    expect(
      jobReadMessage(new ApiError(401, 'PRIVATE_INTERNAL_VALUE')),
    ).toContain('session has expired');
    expect(
      jobReadMessage(new ApiError(503, 'PRIVATE_INTERNAL_VALUE')),
    ).not.toContain('PRIVATE_INTERNAL_VALUE');
  });
});
