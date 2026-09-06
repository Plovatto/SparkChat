import { env } from '@config/env';
import { buildAuthHeader, type SessionAuth } from '@lib/api/session-auth';
import { encryptAttachmentIfPossible } from '@lib/e2ee';
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

type UploadResponse = Partial<UploadedFile & { message: string }>;

async function uploadAttachment(
  endpoint: string,
  fieldName: string,
  content: Blob,
  filename: string,
  mimeType: string,
  auth: SessionAuth,
  roomId: string,
  errorFallback: string,
): Promise<UploadResponse & { url: string }> {
  const { blob, encrypted } = await encryptAttachmentIfPossible(roomId, content);
  const uploadFile = new File([blob], filename, { type: mimeType });

  const formData = new FormData();
  formData.append(fieldName, uploadFile);
  if (encrypted) {
    formData.append('encrypted', '1');
  }

  const response = await fetch(`${env.apiUrl}${endpoint}`, {
    method: 'POST',
    headers: buildAuthHeader(auth),
    body: formData,
  });

  const data = (await response.json().catch(() => null)) as UploadResponse | null;

  if (!response.ok || !data?.url) {
    throw new Error(data?.message ?? errorFallback);
  }

  return { ...data, url: data.url };
}

function extensionFromMimeType(mimeType: string): string {
  const subtype = mimeType.split(';')[0]?.split('/')[1] ?? 'webm';
  return subtype.replace(/[^a-z0-9]/gi, '') || 'webm';
}

function withExtension(name: string, mimeType: string): string {
  const base = name.replace(/\.[^./]+$/, '');
  return `${base}.${extensionFromMimeType(mimeType)}`;
}

export async function uploadChatImage(file: File, auth: SessionAuth, roomId: string): Promise<UploadedImage> {
  const { original, thumbnail } = await buildImageVariants(file);
  const originalMimeType = original === file ? file.type : original.type;
  const originalFilename = original === file ? file.name : withExtension(file.name, originalMimeType);

  const [uploaded, thumbnailUpload] = await Promise.all([
    uploadAttachment(
      '/api/messages/upload-image',
      'image',
      original,
      originalFilename,
      originalMimeType,
      auth,
      roomId,
      'Não foi possível enviar a imagem.',
    ),
    thumbnail
      ? uploadAttachment(
          '/api/messages/upload-image',
          'image',
          thumbnail,
          withExtension(file.name, thumbnail.type),
          thumbnail.type,
          auth,
          roomId,
          'Não foi possível enviar a imagem.',
        )
      : Promise.resolve(null),
  ]);
  const thumbnailUrl = thumbnailUpload?.url;

  return { url: uploaded.url, mimeType: uploaded.mimeType ?? originalMimeType, thumbnailUrl };
}

export async function uploadChatAudio(blob: Blob, mimeType: string, auth: SessionAuth, roomId: string): Promise<UploadedMedia> {
  const filename = `audio-${Date.now()}.${extensionFromMimeType(mimeType)}`;
  const data = await uploadAttachment(
    '/api/messages/upload-audio',
    'audio',
    blob,
    filename,
    mimeType,
    auth,
    roomId,
    'Não foi possível enviar o áudio.',
  );
  return { url: data.url, mimeType: data.mimeType ?? mimeType };
}

export async function uploadChatFile(file: File, auth: SessionAuth, roomId: string): Promise<UploadedFile> {
  const data = await uploadAttachment(
    '/api/messages/upload-file',
    'file',
    file,
    file.name,
    file.type,
    auth,
    roomId,
    'Não foi possível enviar o arquivo.',
  );
  return {
    url: data.url,
    name: data.name ?? file.name,
    mimeType: data.mimeType ?? file.type,
    size: file.size,
  };
}
