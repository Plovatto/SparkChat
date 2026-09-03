import { env } from '@config/env';

interface UploadResponse {
  url: string;
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
  errorFallback: string,
): Promise<string> {
  const formData = new FormData();
  formData.append(fieldName, file);

  const response = await fetch(`${env.apiUrl}${endpoint}`, {
    method: 'POST',
    headers: authHeader(auth),
    body: formData,
  });

  const data = (await response.json().catch(() => null)) as Partial<UploadResponse & { message: string }> | null;

  if (!response.ok || !data?.url) {
    throw new Error(data?.message ?? errorFallback);
  }

  return `${env.apiUrl}${data.url}`;
}

function extensionFromMimeType(mimeType: string): string {
  const subtype = mimeType.split(';')[0]?.split('/')[1] ?? 'webm';
  return subtype.replace(/[^a-z0-9]/gi, '') || 'webm';
}

export function uploadChatImage(file: File, auth: UploadAuth): Promise<string> {
  return uploadMedia('/api/messages/upload-image', 'image', file, auth, 'Não foi possível enviar a imagem.');
}

export function uploadChatAudio(blob: Blob, mimeType: string, auth: UploadAuth): Promise<string> {
  const file = new File([blob], `audio-${Date.now()}.${extensionFromMimeType(mimeType)}`, { type: mimeType });
  return uploadMedia('/api/messages/upload-audio', 'audio', file, auth, 'Não foi possível enviar o áudio.');
}

export async function uploadChatFile(file: File, auth: UploadAuth): Promise<UploadedFile> {
  const formData = new FormData();
  formData.append('file', file);

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
    size: data.size ?? file.size,
  };
}
