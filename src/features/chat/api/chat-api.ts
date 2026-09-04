import { env } from '@config/env';
import { encryptAttachmentIfPossible } from '@lib/e2ee';

interface UploadResponse {
  url: string;
  mimeType: string;
}

export interface UploadedMedia {
  url: string;
  mimeType: string;
}

export interface UploadedFile {
  url: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface UploadAuth {
  userId: string;
  sessionToken: string;
}

function authHeader(auth: UploadAuth): HeadersInit {
  return { Authorization: `Bearer ${auth.userId}:${auth.sessionToken}` };
}

async function uploadMedia(
  endpoint: string,
  fieldName: string,
  file: File,
  auth: UploadAuth,
  roomId: string,
  errorFallback: string,
): Promise<UploadedMedia> {
  const { blob, encrypted } = await encryptAttachmentIfPossible(roomId, file);
  const uploadFile = encrypted ? new File([blob], file.name, { type: file.type }) : file;

  const formData = new FormData();
  formData.append(fieldName, uploadFile);
  if (encrypted) {
    formData.append('encrypted', '1');
  }

  const response = await fetch(`${env.apiUrl}${endpoint}`, {
    method: 'POST',
    headers: authHeader(auth),
    body: formData,
  });

  const data = (await response.json().catch(() => null)) as Partial<UploadResponse & { message: string }> | null;

  if (!response.ok || !data?.url) {
    throw new Error(data?.message ?? errorFallback);
  }

  return { url: `${env.apiUrl}${data.url}`, mimeType: data.mimeType ?? file.type };
}

function extensionFromMimeType(mimeType: string): string {
  const subtype = mimeType.split(';')[0]?.split('/')[1] ?? 'webm';
  return subtype.replace(/[^a-z0-9]/gi, '') || 'webm';
}

export function uploadChatImage(file: File, auth: UploadAuth, roomId: string): Promise<UploadedMedia> {
  return uploadMedia('/api/messages/upload-image', 'image', file, auth, roomId, 'Não foi possível enviar a imagem.');
}

export function uploadChatAudio(blob: Blob, mimeType: string, auth: UploadAuth, roomId: string): Promise<UploadedMedia> {
  const file = new File([blob], `audio-${Date.now()}.${extensionFromMimeType(mimeType)}`, { type: mimeType });
  return uploadMedia('/api/messages/upload-audio', 'audio', file, auth, roomId, 'Não foi possível enviar o áudio.');
}

export async function uploadChatFile(file: File, auth: UploadAuth, roomId: string): Promise<UploadedFile> {
  const { blob, encrypted } = await encryptAttachmentIfPossible(roomId, file);
  const uploadFile = encrypted ? new File([blob], file.name, { type: file.type }) : file;

  const formData = new FormData();
  formData.append('file', uploadFile);
  if (encrypted) {
    formData.append('encrypted', '1');
  }

  const response = await fetch(`${env.apiUrl}/api/messages/upload-file`, {
    method: 'POST',
    headers: authHeader(auth),
    body: formData,
  });

  const data = (await response.json().catch(() => null)) as Partial<UploadedFile & { message: string }> | null;

  if (!response.ok || !data?.url) {
    throw new Error(data?.message ?? 'Não foi possível enviar o arquivo.');
  }

  return {
    url: `${env.apiUrl}${data.url}`,
    name: data.name ?? file.name,
    mimeType: data.mimeType ?? file.type,
    size: file.size,
  };
}
