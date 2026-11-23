import { ApiError, toApiError } from '@lib/api/api-error';
import { authorizedFetch, type SessionAuth } from '@lib/api/session-auth';
import { sealAttachment, type AttachmentBinding } from '@lib/e2ee';
import { GifTooLargeError, padGif } from '@lib/media/gif-padding';
import { buildImageVariants, canDecodeImage } from '@lib/media/image-compression';
import { buildGifMimeType, isGifMediaType } from '@lib/media/media-type';

export interface SealedUpload {
  url: string;
  key: string;
}

export interface UploadedMedia extends SealedUpload {
  mimeType: string;
}

export interface UploadedImage extends UploadedMedia {
  thumbnailUrl?: string;
  thumbnailKey?: string;
}

export interface UploadedFile extends UploadedMedia {
  name: string;
  size: number;
  thumbnailUrl?: string;
  thumbnailKey?: string;
}

type UploadKind = 'image' | 'audio' | 'file' | 'gif';

export const ENCRYPTED_UPLOAD_FILENAME = 'blob.bin';
export const ENCRYPTED_UPLOAD_MIME_TYPE = 'application/octet-stream';

const ALLOWED_MIME_TYPES: Record<UploadKind, ReadonlySet<string>> = {
  image: new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
  gif: new Set(['image/gif', 'image/webp']),
  audio: new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/wav', 'audio/x-wav']),
  file: new Set([
    'application/pdf',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-msvideo',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/x-zip-compressed',
    'text/plain',
    'text/csv',
  ]),
};

const ALLOWED_FILE_EXTENSIONS = new Set(['pdf', 'mp4', 'webm', 'mov', 'avi', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'txt', 'csv']);

const MEGABYTE = 1024 * 1024;
const SEALED_ATTACHMENT_OVERHEAD_BYTES = 24 + 16;

const MAX_UPLOAD_MEGABYTES: Record<Exclude<UploadKind, 'gif'>, number> = {
  image: 5,
  audio: 8,
  file: 50,
};

const FALLBACK_ERROR_KEY: Record<UploadKind, string> = {
  image: 'chat.upload.imageFailed',
  audio: 'chat.upload.audioFailed',
  file: 'chat.upload.fileFailed',
  gif: 'chat.upload.gifFailed',
};

const UPLOAD_ENDPOINT: Record<UploadKind, string> = {
  image: '/api/messages/upload-image',
  audio: '/api/messages/upload-audio',
  file: '/api/messages/upload-file',
  gif: '/api/messages/upload/gif',
};

function baseMimeType(mimeType: string): string {
  return mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
}

function fileExtension(name: string): string {
  const match = /\.([^./]+)$/.exec(name);
  return match?.[1]?.toLowerCase() ?? '';
}

function assertAllowedType(kind: UploadKind, mimeType: string, name?: string): void {
  const allowedMime = ALLOWED_MIME_TYPES[kind].has(baseMimeType(mimeType));
  const allowedExtension = kind !== 'file' || ALLOWED_FILE_EXTENSIONS.has(fileExtension(name ?? ''));
  if (!allowedMime || !allowedExtension) {
    throw new ApiError({ code: 'upload.invalidType', params: { kind } }, FALLBACK_ERROR_KEY[kind]);
  }
}

function assertWithinSizeLimit(kind: Exclude<UploadKind, 'gif'>, content: Blob): void {
  const maxMegabytes = MAX_UPLOAD_MEGABYTES[kind];
  if (content.size + SEALED_ATTACHMENT_OVERHEAD_BYTES > maxMegabytes * MEGABYTE) {
    throw new ApiError({ code: 'upload.tooLarge', params: { kind, maxSize: `${maxMegabytes}MB` } }, FALLBACK_ERROR_KEY[kind]);
  }
}

export interface AttachmentTarget {
  roomId: string;
  messageId: string;
}

async function uploadEncryptedAttachment(kind: UploadKind, content: Blob, auth: SessionAuth, binding: AttachmentBinding): Promise<SealedUpload> {
  const { ciphertext, key } = await sealAttachment(content, binding);
  const uploadFile = new File([ciphertext], ENCRYPTED_UPLOAD_FILENAME, { type: ENCRYPTED_UPLOAD_MIME_TYPE });

  const formData = new FormData();
  formData.append('encrypted', '1');
  formData.append(kind, uploadFile);

  const response = await authorizedFetch(auth, UPLOAD_ENDPOINT[kind], {
    method: 'POST',
    body: formData,
  });

  const data = (await response.json().catch(() => null)) as { url?: unknown } | null;

  if (!response.ok || typeof data?.url !== 'string' || !data.url) {
    throw toApiError(data, FALLBACK_ERROR_KEY[kind]);
  }

  return { url: data.url, key };
}

export async function uploadChatImage(file: File, auth: SessionAuth, target: AttachmentTarget): Promise<UploadedImage> {
  const { original, thumbnail } = await buildImageVariants(file);
  const mimeType = original === file ? file.type : original.type;
  assertAllowedType('image', mimeType);
  if (!thumbnail && !(await canDecodeImage(original))) {
    throw new ApiError({}, 'chat.upload.imageUnreadable');
  }
  assertWithinSizeLimit('image', original);

  const [content, preview] = await Promise.all([
    uploadEncryptedAttachment('image', original, auth, { ...target, slot: 'content' }),
    thumbnail ? uploadEncryptedAttachment('image', thumbnail, auth, { ...target, slot: 'thumbnail' }) : Promise.resolve(undefined),
  ]);

  return {
    url: content.url,
    key: content.key,
    mimeType,
    ...(preview ? { thumbnailUrl: preview.url, thumbnailKey: preview.key } : {}),
  };
}

export async function uploadChatAudio(blob: Blob, mimeType: string, auth: SessionAuth, target: AttachmentTarget): Promise<UploadedMedia> {
  assertAllowedType('audio', mimeType);
  assertWithinSizeLimit('audio', blob);
  const { url, key } = await uploadEncryptedAttachment('audio', blob, auth, { ...target, slot: 'content' });
  return { url, key, mimeType };
}

export async function uploadChatFile(file: File, auth: SessionAuth, target: AttachmentTarget): Promise<UploadedFile> {
  assertAllowedType('file', file.type, file.name);
  assertWithinSizeLimit('file', file);
  const { url, key } = await uploadEncryptedAttachment('file', file, auth, { ...target, slot: 'content' });
  return { url, key, name: file.name, mimeType: file.type, size: file.size };
}

export function uploadLinkPreviewImage(image: Blob, auth: SessionAuth, target: AttachmentTarget): Promise<SealedUpload> {
  return uploadEncryptedAttachment('image', image, auth, { ...target, slot: 'preview' });
}

function withGifKind(error: unknown): unknown {
  if (!(error instanceof ApiError) || error.payload.params?.kind !== undefined) {
    return error;
  }
  return new ApiError({ ...error.payload, params: { ...error.payload.params, kind: 'gif' } }, error.fallbackKey);
}

export async function uploadChatGif(blob: Blob, auth: SessionAuth, target: AttachmentTarget): Promise<UploadedFile> {
  const essence = baseMimeType(blob.type);
  if (!isGifMediaType(essence)) {
    throw new ApiError({ code: 'upload.invalidType', params: { kind: 'gif' } }, FALLBACK_ERROR_KEY.gif);
  }
  let padded: Blob;
  try {
    padded = await padGif(blob);
  } catch (error) {
    if (error instanceof GifTooLargeError) {
      throw new ApiError({ code: 'upload.invalidGifSize' }, FALLBACK_ERROR_KEY.gif);
    }
    throw error;
  }
  const { url, key } = await uploadEncryptedAttachment('gif', padded, auth, { ...target, slot: 'content' }).catch((error: unknown) => {
    throw withGifKind(error);
  });
  return {
    url,
    key,
    name: essence === 'image/gif' ? 'gif.gif' : 'gif.webp',
    mimeType: buildGifMimeType(essence),
    size: padded.size,
  };
}
