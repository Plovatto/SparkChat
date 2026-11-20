import type { SessionAuth } from '@lib/api/session-auth';
import {
  assertCanChangeRoomPhoto,
  clearMyPhoto,
  clearRoomPhoto,
  createProfilePhotoError,
  getCurrentIdentity,
  getProfilePhotoUserId,
  isProfilePhotoReady,
  nextProfileKeyVersion,
  PHOTO_MIME_TYPES,
  PROFILE_PHOTO_FAILED_CODE,
  PROFILE_PHOTO_UNAVAILABLE_CODE,
  publishMyPhoto,
  publishRoomPhoto,
  sealAvatarFile,
  subscribeCurrentIdentity,
  subscribeProfilePhotos,
} from '@lib/e2ee';
import { getStoredSession } from '@features/auth/api/session-storage';
import { uploadEncryptedAvatar } from '../api/avatar-api';

function baseMimeType(mimeType: string): string {
  return mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
}

function assertPhoto(image: Blob): string {
  const mime = baseMimeType(image.type);
  if (!PHOTO_MIME_TYPES.has(mime)) {
    throw createProfilePhotoError('upload.invalidType', { kind: 'avatar' });
  }
  if (image.size === 0) {
    throw createProfilePhotoError(PROFILE_PHOTO_FAILED_CODE);
  }
  return mime;
}

function requireAuth(userId: string): SessionAuth {
  const session = getStoredSession();
  if (!session?.sessionToken || session.id !== userId) {
    throw createProfilePhotoError(PROFILE_PHOTO_UNAVAILABLE_CODE);
  }
  return { userId: session.id, sessionToken: session.sessionToken };
}

export async function uploadMyPhoto(image: Blob): Promise<void> {
  const mime = assertPhoto(image);
  const userId = getProfilePhotoUserId();
  const auth = requireAuth(userId);
  const version = nextProfileKeyVersion();
  const { ciphertext, key } = await sealAvatarFile(image, { kind: 'user', userId, version });
  const url = await uploadEncryptedAvatar(ciphertext, auth);
  if (getCurrentIdentity()?.userId !== userId) {
    throw createProfilePhotoError(PROFILE_PHOTO_FAILED_CODE);
  }
  await publishMyPhoto({ url, fileKey: key, mime }, version, new Blob([image], { type: mime }));
}

export function removeMyPhoto(): Promise<void> {
  return clearMyPhoto();
}

export async function uploadRoomPhoto(roomId: string, image: Blob): Promise<void> {
  const mime = assertPhoto(image);
  const userId = getProfilePhotoUserId();
  const auth = requireAuth(userId);
  await assertCanChangeRoomPhoto(roomId);
  const { ciphertext, key } = await sealAvatarFile(image, { kind: 'room', roomId });
  const url = await uploadEncryptedAvatar(ciphertext, auth);
  await publishRoomPhoto(roomId, { url, fileKey: key, mime }, new Blob([image], { type: mime }));
}

export function removeRoomPhoto(roomId: string): Promise<void> {
  return clearRoomPhoto(roomId);
}

let pendingPhoto: Blob | null = null;
let pendingFlush: Promise<void> | null = null;
let pendingWatchers: (() => void)[] = [];

function stopWatchingPending(): void {
  for (const stop of pendingWatchers) {
    stop();
  }
  pendingWatchers = [];
}

function canFlushPending(): boolean {
  const identity = getCurrentIdentity();
  const session = getStoredSession();
  return Boolean(identity && isProfilePhotoReady() && session?.sessionToken && session.id === identity.userId);
}

function flushPendingPhoto(): void {
  if (!pendingPhoto || pendingFlush || !canFlushPending()) {
    return;
  }
  const image = pendingPhoto;
  pendingPhoto = null;
  stopWatchingPending();
  pendingFlush = uploadMyPhoto(image)
    .catch((error: unknown) => {
      console.error('[profile-photos] uploading the sign-up photo failed', error);
    })
    .finally(() => {
      pendingFlush = null;
    });
}

function watchPending(): void {
  if (pendingWatchers.length > 0) {
    return;
  }
  pendingWatchers = [
    subscribeCurrentIdentity((identity) => {
      if (!identity) {
        pendingPhoto = null;
        stopWatchingPending();
        return;
      }
      flushPendingPhoto();
    }),
    subscribeProfilePhotos((change) => {
      if (change.kind === 'ready') {
        flushPendingPhoto();
      }
    }),
  ];
}

export function queuePendingMyPhoto(image: Blob): void {
  pendingPhoto = image;
  watchPending();
  flushPendingPhoto();
}

export function hasPendingMyPhoto(): boolean {
  return pendingPhoto !== null;
}

export function waitForPendingMyPhoto(): Promise<void> {
  return pendingFlush ?? Promise.resolve();
}
