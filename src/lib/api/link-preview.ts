import type { MessageLinkPreview } from '@lib/socket';
import { authorizedFetch, type SessionAuth } from './session-auth';

function postJson(path: string, body: unknown, auth: SessionAuth): Promise<Response> {
  return authorizedFetch(auth, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function fetchLinkPreview(url: string, auth: SessionAuth): Promise<MessageLinkPreview | null> {
  const response = await postJson('/api/link-preview', { url }, auth);

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as MessageLinkPreview;
}

export async function fetchLinkPreviewImageBlob(imageUrl: string, auth: SessionAuth): Promise<Blob | null> {
  const response = await postJson('/api/link-preview/image', { url: imageUrl }, auth);

  if (!response.ok) {
    return null;
  }

  return response.blob();
}
