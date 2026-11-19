import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearGifStatusCache, loadGifStatus } from './gif-status-cache';

vi.mock('@config/env', () => ({ env: { apiUrl: 'https://api.test' } }));

const AUTH = { userId: 'user-1', sessionToken: 'token-1' };

afterEach(() => {
  clearGifStatusCache();
});

describe('loadGifStatus', () => {
  it('asks the server once per session', async () => {
    const fetchStatus = vi.fn(() => Promise.resolve(true));

    await expect(loadGifStatus(AUTH, fetchStatus)).resolves.toBe(true);
    await expect(loadGifStatus(AUTH, fetchStatus)).resolves.toBe(true);
    await loadGifStatus({ ...AUTH, sessionToken: 'token-2' }, fetchStatus);

    expect(fetchStatus).toHaveBeenCalledTimes(2);
  });

  it('keeps a disabled answer for the session', async () => {
    const fetchStatus = vi.fn(() => Promise.resolve(false));

    await loadGifStatus(AUTH, fetchStatus);
    await loadGifStatus(AUTH, fetchStatus);

    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });

  it('hides the gallery on network failure and asks again later', async () => {
    const fetchStatus = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(true);

    await expect(loadGifStatus(AUTH, fetchStatus)).resolves.toBe(false);
    await expect(loadGifStatus(AUTH, fetchStatus)).resolves.toBe(true);
  });

  it('uses the status endpoint by default', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(Response.json({ enabled: true }));
    vi.stubGlobal('fetch', fetchSpy);

    await expect(loadGifStatus(AUTH)).resolves.toBe(true);

    expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.test/api/gifs/status');
    vi.unstubAllGlobals();
  });
});
