import { env } from '@config/env';
import type { MessageLinkPreview } from '@lib/socket';

export interface LinkPreviewAuth {
  userId: string;
  sessionToken: string;
}

function authHeader(auth: LinkPreviewAuth): HeadersInit {
  return { Authorization: `Bearer ${auth.userId}:${auth.sessionToken}` };
}

export async function fetchLinkPreview(url: string, auth: LinkPreviewAuth): Promise<MessageLinkPreview | null> {
  const response = await fetch(`${env.apiUrl}/api/link-preview`, {
    method: 'POST',
    headers: { ...authHeader(auth), 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as MessageLinkPreview;
}

export async function fetchLinkPreviewImageObjectUrl(imageUrl: string, auth: LinkPreviewAuth): Promise<string | null> {
  const response = await fetch(`${env.apiUrl}/api/link-preview/image?url=${encodeURIComponent(imageUrl)}`, {
    headers: authHeader(auth),
  });

  if (!response.ok) {
    return null;
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
