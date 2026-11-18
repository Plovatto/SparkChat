import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLinkPreviewImageBlob } from './link-preview';

const AUTH = { userId: 'user-1', sessionToken: 'token' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchLinkPreviewImageBlob', () => {
  it('sends the image URL in a POST body instead of the query string', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(new Blob(['png'], { type: 'image/png' })));
    vi.stubGlobal('fetch', fetchSpy);

    await fetchLinkPreviewImageBlob('https://site.test/cover.png?token=secret', AUTH);

    const [requestUrl, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(requestUrl).toMatch(/\/api\/link-preview\/image$/);
    expect(requestUrl).not.toContain('secret');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ url: 'https://site.test/cover.png?token=secret' });
  });
});
