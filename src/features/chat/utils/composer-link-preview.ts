import type { SessionAuth } from '@lib/api/session-auth';
import type { MessageLinkPreview } from '@lib/socket';

export interface ComposerLinkPreview {
  preview: MessageLinkPreview;
  image: Blob | null;
}

export interface ComposerLinkPreviewDeps {
  fetchPreview: (url: string, auth: SessionAuth) => Promise<MessageLinkPreview | null>;
  fetchImage: (imageUrl: string, auth: SessionAuth) => Promise<Blob | null>;
  normalizeImage: (image: Blob) => Promise<Blob | null>;
}

export async function loadComposerLinkPreview(
  typedUrl: string,
  auth: SessionAuth,
  deps: ComposerLinkPreviewDeps,
): Promise<ComposerLinkPreview | null> {
  const fetched = await deps.fetchPreview(typedUrl, auth);
  if (!fetched?.title) {
    return null;
  }

  const rawImage = fetched.imageUrl ? await deps.fetchImage(fetched.imageUrl, auth).catch(() => null) : null;
  const image = rawImage ? await deps.normalizeImage(rawImage).catch(() => null) : null;

  return {
    preview: {
      url: typedUrl,
      title: fetched.title,
      description: fetched.description ?? null,
      imageUrl: null,
      siteName: fetched.siteName ?? null,
    },
    image,
  };
}

export async function finalizeComposerLinkPreview(
  composer: ComposerLinkPreview,
  uploadImage: (image: Blob) => Promise<string>,
): Promise<MessageLinkPreview> {
  const imageUrl = composer.image ? await uploadImage(composer.image).catch(() => null) : null;
  return { ...composer.preview, imageUrl };
}
