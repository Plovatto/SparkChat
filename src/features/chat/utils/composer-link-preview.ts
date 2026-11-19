import type { SessionAuth } from '@lib/api/session-auth';
import type { MessageFileMeta, MessageLinkPreview } from '@lib/socket';

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

export interface OutgoingLinkPreview {
  linkPreview: MessageLinkPreview;
  fileMeta?: MessageFileMeta;
}

export const LINK_PREVIEW_FILE_NAME = 'link-preview';

export async function finalizeComposerLinkPreview(
  composer: ComposerLinkPreview,
  uploadImage: (image: Blob) => Promise<{ url: string; key: string }>,
): Promise<OutgoingLinkPreview> {
  const image = composer.image;
  const uploaded = image && image.size > 0 ? await uploadImage(image).catch(() => null) : null;
  if (!image || !uploaded) {
    return { linkPreview: { ...composer.preview, imageUrl: null } };
  }
  return {
    linkPreview: { ...composer.preview, imageUrl: uploaded.url },
    fileMeta: { name: LINK_PREVIEW_FILE_NAME, mimeType: image.type || 'image/webp', size: image.size, previewKey: uploaded.key },
  };
}
