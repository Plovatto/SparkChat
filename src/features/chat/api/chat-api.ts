import { env } from '@config/env';

interface UploadResponse {
  url: string;
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
