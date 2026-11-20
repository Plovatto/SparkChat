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
  const owner = getCurrentIdentity()?.userId;
  pendingPhoto = null;
  stopWatchingPending();
  if (!owner) {
    return;
  }
  pendingFlush = uploadWithRetries(image, owner)
    .catch((error: unknown) => {
      console.error('[profile-photos] uploading the sign-up photo failed', error);
      if (isCurrentOwner(owner)) {
        setFailedPendingPhoto({ image, owner });
      }
    })
    .finally(() => {
      pendingFlush = null;
    });
}

export const PENDING_PHOTO_RETRY_DELAYS_MS = [2000, 5000];

const NON_RETRYABLE_CODES = new Set(['upload.invalidType', 'upload.tooLarge', 'upload.userQuotaExceeded', 'upload.quotaExceeded', PROFILE_PHOTO_UNAVAILABLE_CODE]);

function isCurrentOwner(owner: string): boolean {
  return getCurrentIdentity()?.userId === owner;
}

function isRetryable(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code !== 'string' || !NON_RETRYABLE_CODES.has(code);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadWithRetries(image: Blob, owner: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    if (!isCurrentOwner(owner)) {
      throw createProfilePhotoError(PROFILE_PHOTO_UNAVAILABLE_CODE);
    }
    try {
      await uploadMyPhoto(image);
      return;
    } catch (error) {
      const delay = PENDING_PHOTO_RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !isRetryable(error) || !isCurrentOwner(owner)) {
        throw error;
      }
      await wait(delay);
    }
  }
}

interface FailedPendingPhoto {
  image: Blob;
  owner: string;
}

let failedPendingPhoto: FailedPendingPhoto | null = null;
const failedPendingListeners = new Set<() => void>();

let stopWatchingFailed: (() => void) | null = null;

function setFailedPendingPhoto(failed: FailedPendingPhoto | null): void {
  failedPendingPhoto = failed;
  stopWatchingFailed?.();
  stopWatchingFailed = failed
    ? subscribeCurrentIdentity((identity) => {
        if (identity?.userId !== failed.owner) {
          setFailedPendingPhoto(null);
        }
      })
    : null;
  for (const listener of failedPendingListeners) {
    listener();
  }
}

export function hasFailedPendingPhoto(): boolean {
  return failedPendingPhoto !== null && isCurrentOwner(failedPendingPhoto.owner);
}

export function subscribeFailedPendingPhoto(listener: () => void): () => void {
  failedPendingListeners.add(listener);
  return () => {
    failedPendingListeners.delete(listener);
  };
}

export function dismissFailedPendingPhoto(): void {
  setFailedPendingPhoto(null);
}

export function retryFailedPendingPhoto(): void {
  const failed = failedPendingPhoto;
  setFailedPendingPhoto(null);
  if (!failed || !isCurrentOwner(failed.owner)) {
    return;
  }
  queuePendingMyPhoto(failed.image);
}

function watchPending(): void {
  if (pendingWatchers.length > 0) {
    return;
  }
  pendingWatchers = [
    subscribeCurrentIdentity((identity) => {
      if (!identity) {
        pendingPhoto = null;
        setFailedPendingPhoto(null);
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
