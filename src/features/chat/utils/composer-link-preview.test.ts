import { describe, expect, it, vi } from 'vitest';
import { finalizeComposerLinkPreview, loadComposerLinkPreview, type ComposerLinkPreviewDeps } from './composer-link-preview';

const AUTH = { userId: 'user-1', sessionToken: 'token' };
const TYPED_URL = 'https://site.test/article';

function deps(overrides: Partial<ComposerLinkPreviewDeps> = {}): ComposerLinkPreviewDeps {
  return {
    fetchPreview: vi.fn().mockResolvedValue({
      url: 'https://evil.test/elsewhere',
      title: 'Artigo',
      description: 'Resumo',
      imageUrl: 'https://site.test/cover.jpg',
      siteName: 'Site',
    }),
    fetchImage: vi.fn().mockResolvedValue(new Blob(['raw'], { type: 'image/jpeg' })),
    normalizeImage: vi.fn().mockResolvedValue(new Blob(['webp'], { type: 'image/webp' })),
    ...overrides,
  };
}

describe('loadComposerLinkPreview', () => {
  it('keeps the URL the user typed and ignores the server url', async () => {
    const result = await loadComposerLinkPreview(TYPED_URL, AUTH, deps());

    expect(result?.preview.url).toBe(TYPED_URL);
    expect(result?.preview.title).toBe('Artigo');
  });

  it('never carries the remote image URL into the message', async () => {
    const result = await loadComposerLinkPreview(TYPED_URL, AUTH, deps());

    expect(result?.preview.imageUrl).toBeNull();
    expect(result?.image?.type).toBe('image/webp');
  });

  it('still returns the preview when the image cannot be loaded', async () => {
    const result = await loadComposerLinkPreview(TYPED_URL, AUTH, deps({ fetchImage: vi.fn().mockRejectedValue(new Error('boom')) }));

    expect(result?.preview.title).toBe('Artigo');
    expect(result?.image).toBeNull();
  });

  it('returns null when the server has no preview', async () => {
    expect(await loadComposerLinkPreview(TYPED_URL, AUTH, deps({ fetchPreview: vi.fn().mockResolvedValue(null) }))).toBeNull();
  });
});

describe('finalizeComposerLinkPreview', () => {
  const preview = { url: TYPED_URL, title: 'Artigo', description: null, imageUrl: null, siteName: null };

  it('replaces the image with the encrypted upload URL', async () => {
    const upload = vi.fn().mockResolvedValue('https://cdn.test/uploads/images/p.webp?e2e=1');

    const result = await finalizeComposerLinkPreview({ preview, image: new Blob(['x']) }, upload);

    expect(result.imageUrl).toBe('https://cdn.test/uploads/images/p.webp?e2e=1');
  });

  it('sends the preview without an image when the upload fails', async () => {
    const result = await finalizeComposerLinkPreview({ preview, image: new Blob(['x']) }, vi.fn().mockRejectedValue(new Error('quota')));

    expect(result.imageUrl).toBeNull();
  });

  it('does not upload anything when there is no image', async () => {
    const upload = vi.fn();

    const result = await finalizeComposerLinkPreview({ preview, image: null }, upload);

    expect(upload).not.toHaveBeenCalled();
    expect(result.imageUrl).toBeNull();
  });
});
