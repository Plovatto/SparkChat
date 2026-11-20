import { env } from '@config/env';
import { readApiErrorPayload } from '@lib/api/api-error';
import { buildAuthHeader, type SessionAuth } from '@lib/api/session-auth';
import { createProfilePhotoError } from '@lib/e2ee';
import { isAvatarStorageUrl } from '@lib/media/media-origin';
import { ENCRYPTED_UPLOAD_FILENAME, ENCRYPTED_UPLOAD_MIME_TYPE } from '@features/chat/api/chat-api';

export const AVATAR_UPLOAD_ENDPOINT = '/api/avatars/upload';
export const AVATAR_UPLOAD_FIELD = 'image';
export const MAX_AVATAR_UPLOAD_BYTES = 512 * 1024;
export const MAX_AVATAR_UPLOAD_LABEL = '512KB';

export async function uploadEncryptedAvatar(ciphertext: Blob, auth: SessionAuth): Promise<string> {
  if (ciphertext.size > MAX_AVATAR_UPLOAD_BYTES) {
    throw createProfilePhotoError('upload.tooLarge', { kind: 'avatar', maxSize: MAX_AVATAR_UPLOAD_LABEL });
  }
  const formData = new FormData();
  formData.append('encrypted', '1');
  formData.append(AVATAR_UPLOAD_FIELD, new File([ciphertext], ENCRYPTED_UPLOAD_FILENAME, { type: ENCRYPTED_UPLOAD_MIME_TYPE }));

  let response: Response;
  try {
    response = await fetch(`${env.apiUrl}${AVATAR_UPLOAD_ENDPOINT}`, {
      method: 'POST',
      headers: buildAuthHeader(auth),
      body: formData,
    });
  } catch {
    throw createProfilePhotoError('profilePhoto.failed');
  }

  const data = (await response.json().catch(() => null)) as { url?: unknown } | null;
  if (!response.ok) {
    const payload = readApiErrorPayload(data);
    throw createProfilePhotoError(payload.code, payload.params);
  }
  if (typeof data?.url !== 'string' || !isAvatarStorageUrl(data.url)) {
    throw createProfilePhotoError('profilePhoto.failed');
  }
  return data.url;
}
