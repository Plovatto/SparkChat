import { env } from '@config/env';
import { buildAuthHeader, type SessionAuth } from '@lib/api/session-auth';
import { encryptAttachmentIfPossible } from '@lib/e2ee';

export interface UploadedMedia {
  url: string;
  mimeType: string;
}

export interface UploadedFile extends UploadedMedia {
  name: string;
  size: number;
}

type UploadResponse = Partial<UploadedFile & { message: string }>;

async function uploadAttachment(
  endpoint: string,
  fieldName: string,
  file: File,
  auth: SessionAuth,
  roomId: string,
  errorFallback: string,
): Promise<UploadResponse & { url: string }> {
  const { blob, encrypted } = await encryptAttachmentIfPossible(roomId, file);
  const uploadFile = encrypted ? new File([blob], file.name, { type: file.type }) : file;

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

  return { ...data, url: `${env.apiUrl}${data.url}` };
}

function extensionFromMimeType(mimeType: string): string {
  const subtype = mimeType.split(';')[0]?.split('/')[1] ?? 'webm';
  return subtype.replace(/[^a-z0-9]/gi, '') || 'webm';
}

export async function uploadChatImage(file: File, auth: SessionAuth, roomId: string): Promise<UploadedMedia> {
  const data = await uploadAttachment('/api/messages/upload-image', 'image', file, auth, roomId, 'Não foi possível enviar a imagem.');
  return { url: data.url, mimeType: data.mimeType ?? file.type };
}

export async function uploadChatAudio(blob: Blob, mimeType: string, auth: SessionAuth, roomId: string): Promise<UploadedMedia> {
  const file = new File([blob], `audio-${Date.now()}.${extensionFromMimeType(mimeType)}`, { type: mimeType });
  const data = await uploadAttachment('/api/messages/upload-audio', 'audio', file, auth, roomId, 'Não foi possível enviar o áudio.');
  return { url: data.url, mimeType: data.mimeType ?? file.type };
}

export async function uploadChatFile(file: File, auth: SessionAuth, roomId: string): Promise<UploadedFile> {
  const data = await uploadAttachment('/api/messages/upload-file', 'file', file, auth, roomId, 'Não foi possível enviar o arquivo.');
  return {
    url: data.url,
    name: data.name ?? file.name,
    mimeType: data.mimeType ?? file.type,
    size: file.size,
  };
}
