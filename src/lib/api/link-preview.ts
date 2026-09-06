import { env } from '@config/env';
import type { MessageLinkPreview } from '@lib/socket';
import { buildAuthHeader, type SessionAuth } from './session-auth';

export async function fetchLinkPreview(url: string, auth: SessionAuth): Promise<MessageLinkPreview | null> {
  const response = await fetch(`${env.apiUrl}/api/link-preview`, {
    method: 'POST',
    headers: { ...buildAuthHeader(auth), 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as MessageLinkPreview;
}

export async function fetchLinkPreviewImageBlob(imageUrl: string, auth: SessionAuth): Promise<Blob | null> {
  const response = await fetch(`${env.apiUrl}/api/link-preview/image?url=${encodeURIComponent(imageUrl)}`, {
    headers: buildAuthHeader(auth),
  });

  if (!response.ok) {
    return null;
  }

  return response.blob();
}
