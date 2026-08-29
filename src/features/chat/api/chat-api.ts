import { env } from '@config/env';

interface UploadImageResponse {
  url: string;
}

export async function uploadChatImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch(`${env.apiUrl}/api/messages/upload-image`, {
    method: 'POST',
    body: formData,
  });

  const data = (await response.json().catch(() => null)) as Partial<UploadImageResponse & { message: string }> | null;

  if (!response.ok || !data?.url) {
    throw new Error(data?.message ?? 'Não foi possível enviar a imagem.');
  }

  return `${env.apiUrl}${data.url}`;
}
