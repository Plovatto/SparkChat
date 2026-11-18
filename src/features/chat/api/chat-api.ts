import { env } from '@config/env';
import { ApiError, toApiError } from '@lib/api/api-error';
import { buildAuthHeader, type SessionAuth } from '@lib/api/session-auth';
import { encryptAttachment } from '@lib/e2ee';
import { buildImageVariants } from '@lib/media/image-compression';

export interface UploadedMedia {
  url: string;
  mimeType: string;
}

export interface UploadedImage extends UploadedMedia {
  thumbnailUrl?: string;
}

export interface UploadedFile extends UploadedMedia {
  name: string;
  size: number;
  thumbnailUrl?: string;
}

type UploadKind = 'image' | 'audio' | 'file';

export const ENCRYPTED_UPLOAD_FILENAME = 'blob.bin';
export const ENCRYPTED_UPLOAD_MIME_TYPE = 'application/octet-stream';

const ALLOWED_MIME_TYPES: Record<UploadKind, ReadonlySet<string>> = {
  image: new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
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

const FALLBACK_ERROR_KEY: Record<UploadKind, string> = {
  image: 'chat.upload.imageFailed',
  audio: 'chat.upload.audioFailed',
  file: 'chat.upload.fileFailed',
};

const UPLOAD_ENDPOINT: Record<UploadKind, string> = {
  image: '/api/messages/upload-image',
  audio: '/api/messages/upload-audio',
  file: '/api/messages/upload-file',
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

async function uploadEncryptedAttachment(kind: UploadKind, content: Blob, auth: SessionAuth, roomId: string): Promise<string> {
  const ciphertext = await encryptAttachment(roomId, content);
  const uploadFile = new File([ciphertext], ENCRYPTED_UPLOAD_FILENAME, { type: ENCRYPTED_UPLOAD_MIME_TYPE });

  const formData = new FormData();
  formData.append('encrypted', '1');
  formData.append(kind, uploadFile);

  const response = await fetch(`${env.apiUrl}${UPLOAD_ENDPOINT[kind]}`, {
    method: 'POST',
    headers: buildAuthHeader(auth),
    body: formData,
  });

  const data = (await response.json().catch(() => null)) as { url?: unknown } | null;

  if (!response.ok || typeof data?.url !== 'string' || !data.url) {
    throw toApiError(data, FALLBACK_ERROR_KEY[kind]);
  }

  return data.url;
}

export async function uploadChatImage(file: File, auth: SessionAuth, roomId: string): Promise<UploadedImage> {
  const { original, thumbnail } = await buildImageVariants(file);
  const mimeType = original === file ? file.type : original.type;
  assertAllowedType('image', mimeType);

  const [url, thumbnailUrl] = await Promise.all([
    uploadEncryptedAttachment('image', original, auth, roomId),
    thumbnail ? uploadEncryptedAttachment('image', thumbnail, auth, roomId) : Promise.resolve(undefined),
  ]);

  return { url, mimeType, thumbnailUrl };
}

export async function uploadChatAudio(blob: Blob, mimeType: string, auth: SessionAuth, roomId: string): Promise<UploadedMedia> {
  assertAllowedType('audio', mimeType);
  const url = await uploadEncryptedAttachment('audio', blob, auth, roomId);
  return { url, mimeType };
}

export async function uploadChatFile(file: File, auth: SessionAuth, roomId: string): Promise<UploadedFile> {
  assertAllowedType('file', file.type, file.name);
  const url = await uploadEncryptedAttachment('file', file, auth, roomId);
  return { url, name: file.name, mimeType: file.type, size: file.size };
}

export function uploadLinkPreviewImage(image: Blob, auth: SessionAuth, roomId: string): Promise<string> {
  return uploadEncryptedAttachment('image', image, auth, roomId);
}
