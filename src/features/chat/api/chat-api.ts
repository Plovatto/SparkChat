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

async function uploadMedia(endpoint: string, fieldName: string, file: File, errorFallback: string): Promise<string> {
  const formData = new FormData();
  formData.append(fieldName, file);

  const response = await fetch(`${env.apiUrl}${endpoint}`, {
    method: 'POST',
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

export function uploadChatImage(file: File): Promise<string> {
  return uploadMedia('/api/messages/upload-image', 'image', file, 'Não foi possível enviar a imagem.');
}

export function uploadChatAudio(blob: Blob, mimeType: string): Promise<string> {
  const file = new File([blob], `audio-${Date.now()}.${extensionFromMimeType(mimeType)}`, { type: mimeType });
  return uploadMedia('/api/messages/upload-audio', 'audio', file, 'Não foi possível enviar o áudio.');
}

export async function uploadChatFile(file: File): Promise<UploadedFile> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${env.apiUrl}/api/messages/upload-file`, {
    method: 'POST',
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
