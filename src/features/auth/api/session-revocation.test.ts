import { afterEach, describe, expect, it, vi } from 'vitest';
import { revokeServerSession } from './session-revocation';

vi.mock('@config/env', () => ({ env: { apiUrl: 'https://api.test', socketUrl: 'https://api.test' } }));

const auth = { userId: 'user-1', sessionToken: 'token-1' };

function stubFetch(...outcomes: (number | Error)[]) {
  const fetchMock = vi.fn();
  for (const outcome of outcomes) {
    if (outcome instanceof Error) {
      fetchMock.mockRejectedValueOnce(outcome);
    } else {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: outcome }));
    }
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('revokeServerSession', () => {
  it('posts to the logout endpoint with the bearer session and keepalive', async () => {
    const fetchMock = stubFetch(204);
    await expect(revokeServerSession(auth, { retryDelayMs: 0 })).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/api/users/logout');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(init.headers).toEqual({ Authorization: 'Bearer user-1:token-1' });
  });

  it.each([401, 404])('treats %i as already logged out', async (status) => {
    const fetchMock = stubFetch(status);
    await expect(revokeServerSession(auth, { retryDelayMs: 0 })).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries after network and server errors', async () => {
    const fetchMock = stubFetch(new TypeError('offline'), 503, 204);
    await expect(revokeServerSession(auth, { retryDelayMs: 0 })).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('gives up after the configured attempts', async () => {
    const fetchMock = stubFetch(500, new TypeError('offline'));
    await expect(revokeServerSession(auth, { attempts: 2, retryDelayMs: 0 })).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
