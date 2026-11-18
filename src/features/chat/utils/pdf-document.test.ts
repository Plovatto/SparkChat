import { afterEach, describe, expect, it, vi } from 'vitest';
import { readLocalPdfBytes } from './pdf-document';

describe('readLocalPdfBytes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refuses any source other than a local object url', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    await expect(readLocalPdfBytes('https://cdn.test/uploads/files/a.pdf?e2e=1')).rejects.toThrow();
    await expect(readLocalPdfBytes('data:application/pdf;base64,JVBERi0=')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads the bytes of a local object url', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => Promise.resolve(new Response(new Uint8Array([37, 80, 68, 70])))));

    await expect(readLocalPdfBytes('blob:https://app.test/1')).resolves.toEqual(new Uint8Array([37, 80, 68, 70]));
  });
});
