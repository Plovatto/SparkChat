import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ActionsNamespace from './photo-actions';

const state = vi.hoisted(() => ({
  identity: null as { userId: string } | null,
  ready: false,
  session: null as { id: string; sessionToken: string } | null,
  identityListeners: new Set<(identity: { userId: string } | null) => void>(),
  photoListeners: new Set<(change: { kind: string }) => void>(),
  published: [] as { pointer: { url: string; fileKey: string; mime: string }; version: number; plaintext: Blob }[],
  sealed: [] as { binding: unknown; size: number }[],
  canChange: true,
}));

vi.mock('@lib/i18n/app-i18n', () => ({ translate: (key: string) => key, hasTranslation: () => true }));

vi.mock('@config/env', () => ({ env: { apiUrl: 'https://api.example.com' } }));

vi.mock('@features/chat/api/chat-api', () => ({ ENCRYPTED_UPLOAD_FILENAME: 'blob.bin', ENCRYPTED_UPLOAD_MIME_TYPE: 'application/octet-stream' }));

vi.mock('@features/auth/api/session-storage', () => ({ getStoredSession: () => state.session }));

vi.mock('@lib/e2ee', async () => {
  const { ApiError } = await import('@lib/api/api-error');
  const createProfilePhotoError = (code: string | undefined, params?: Record<string, string>) =>
    new ApiError({ code: code ?? 'profilePhoto.failed', ...(params ? { params } : {}) }, 'errors.profilePhoto.failed');
  return {
    PHOTO_MIME_TYPES: new Set(['image/webp', 'image/jpeg', 'image/png']),
    PROFILE_PHOTO_FAILED_CODE: 'profilePhoto.failed',
    PROFILE_PHOTO_UNAVAILABLE_CODE: 'profilePhoto.unavailable',
    createProfilePhotoError,
    getCurrentIdentity: () => state.identity,
    getProfilePhotoUserId: () => {
      if (!state.identity) {
        throw createProfilePhotoError('profilePhoto.unavailable');
      }
      return state.identity.userId;
    },
    isProfilePhotoReady: () => Boolean(state.identity && state.ready),
    nextProfileKeyVersion: () => 2,
    sealAvatarFile: (image: Blob, binding: unknown) => {
      state.sealed.push({ binding, size: image.size });
      return Promise.resolve({ ciphertext: new Blob([new Uint8Array(image.size + 40)]), key: 'k'.repeat(43) });
    },
    publishMyPhoto: (pointer: { url: string; fileKey: string; mime: string }, version: number, plaintext: Blob) => {
      state.published.push({ pointer, version, plaintext });
      return Promise.resolve();
    },
    publishRoomPhoto: () => Promise.resolve(),
    assertCanChangeRoomPhoto: () => (state.canChange ? Promise.resolve() : Promise.reject(createProfilePhotoError('profilePhoto.notAllowed'))),
    clearMyPhoto: () => Promise.resolve(),
    clearRoomPhoto: () => Promise.resolve(),
    subscribeCurrentIdentity: (listener: (identity: { userId: string } | null) => void) => {
      state.identityListeners.add(listener);
      return () => state.identityListeners.delete(listener);
    },
    subscribeProfilePhotos: (listener: (change: { kind: string }) => void) => {
      state.photoListeners.add(listener);
      return () => state.photoListeners.delete(listener);
    },
  };
});

const UPLOADED_URL = 'https://media.example.com/uploads/avatars/abc.bin';

let fetchMock: ReturnType<typeof vi.fn>;
let actions: typeof ActionsNamespace;

function setIdentity(userId: string | null): void {
  state.identity = userId ? { userId } : null;
  for (const listener of Array.from(state.identityListeners)) {
    listener(state.identity);
  }
}

function markReady(): void {
  state.ready = true;
  for (const listener of Array.from(state.photoListeners)) {
    listener({ kind: 'ready' });
  }
}

async function settle(): Promise<void> {
  for (let round = 0; round < 10; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function webp(size = 1000): Blob {
  return new Blob([new Uint8Array(size)], { type: 'image/webp' });
}

beforeEach(async () => {
  vi.resetModules();
  state.identity = null;
  state.ready = false;
  state.session = null;
  state.identityListeners.clear();
  state.photoListeners.clear();
  state.published = [];
  state.sealed = [];
  state.canChange = true;
  fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ url: UPLOADED_URL }), { status: 201 })));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  actions = await import('./photo-actions');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('uploadMyPhoto', () => {
  it('seals the photo for the next version, uploads neutral bytes and publishes the pointer', async () => {
    state.session = { id: 'u1', sessionToken: 'token' };
    setIdentity('u1');
    markReady();

    await actions.uploadMyPhoto(webp());

    expect(state.sealed).toEqual([{ binding: { kind: 'user', userId: 'u1', version: 2 }, size: 1000 }]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/api/avatars/upload');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer u1:token');
    const form = init.body as FormData;
    expect(form.get('encrypted')).toBe('1');
    const file = form.get('image') as File;
    expect(file.name).toBe('blob.bin');
    expect(file.type).toBe('application/octet-stream');
    expect(state.published).toHaveLength(1);
    expect(state.published[0]).toMatchObject({ pointer: { url: UPLOADED_URL, fileKey: 'k'.repeat(43), mime: 'image/webp' }, version: 2 });
  });

  it('rejects an unsupported format, a file over the limit and a server failure with translatable codes', async () => {
    state.session = { id: 'u1', sessionToken: 'token' };
    setIdentity('u1');

    await expect(actions.uploadMyPhoto(new Blob(['x'], { type: 'image/gif' }))).rejects.toMatchObject({ code: 'upload.invalidType' });
    await expect(actions.uploadMyPhoto(webp(600 * 1024))).rejects.toMatchObject({ code: 'upload.tooLarge' });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'upload.userQuotaExceeded' }), { status: 413 }));
    await expect(actions.uploadMyPhoto(webp())).rejects.toMatchObject({ code: 'upload.userQuotaExceeded' });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ url: 'https://evil.example.com/x.png' }), { status: 201 }));
    await expect(actions.uploadMyPhoto(webp())).rejects.toMatchObject({ code: 'profilePhoto.failed' });

    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await expect(actions.uploadMyPhoto(webp())).rejects.toMatchObject({ code: 'profilePhoto.failed' });
    expect(state.published).toHaveLength(0);
  });

  it('rejects without an identity or a matching session', async () => {
    await expect(actions.uploadMyPhoto(webp())).rejects.toMatchObject({ code: 'profilePhoto.unavailable' });
    state.session = { id: 'someone-else', sessionToken: 'token' };
    setIdentity('u1');
    await expect(actions.uploadMyPhoto(webp())).rejects.toMatchObject({ code: 'profilePhoto.unavailable' });
  });
});

describe('uploadRoomPhoto', () => {
  it('checks the permission before uploading anything', async () => {
    state.session = { id: 'u1', sessionToken: 'token' };
    setIdentity('u1');
    state.canChange = false;
    await expect(actions.uploadRoomPhoto('room-1', webp())).rejects.toMatchObject({ code: 'profilePhoto.notAllowed' });
    expect(fetchMock).not.toHaveBeenCalled();

    state.canChange = true;
    await actions.uploadRoomPhoto('room-1', webp());
    expect(state.sealed.at(-1)?.binding).toEqual({ kind: 'room', roomId: 'room-1' });
  });
});

describe('queuePendingMyPhoto', () => {
  it('waits for the registration to finish and uploads once the identity and socket are ready', async () => {
    actions.queuePendingMyPhoto(webp());
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(actions.hasPendingMyPhoto()).toBe(true);

    state.session = { id: 'u1', sessionToken: 'token' };
    markReady();
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();

    setIdentity('u1');
    await settle();
    await actions.waitForPendingMyPhoto();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(state.published).toHaveLength(1);
    expect(actions.hasPendingMyPhoto()).toBe(false);

    markReady();
    setIdentity('u1');
    await settle();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('keeps only the latest queued photo and forgets it on logout', async () => {
    actions.queuePendingMyPhoto(webp(10));
    actions.queuePendingMyPhoto(webp(20));
    setIdentity(null);
    expect(actions.hasPendingMyPhoto()).toBe(false);

    state.session = { id: 'u1', sessionToken: 'token' };
    state.ready = true;
    setIdentity('u1');
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uploads right away when everything is already ready', async () => {
    state.session = { id: 'u1', sessionToken: 'token' };
    state.ready = true;
    setIdentity('u1');
    actions.queuePendingMyPhoto(webp(30));
    await actions.waitForPendingMyPhoto();
    expect(state.sealed.at(-1)?.size).toBe(30);
  });
});

function useFetch(status: number): void {
  fetchMock = vi.fn(() => Promise.resolve(new Response(status === 201 ? JSON.stringify({ url: UPLOADED_URL }) : '{}', { status })));
  vi.stubGlobal('fetch', fetchMock);
}

describe('failed sign-up photo', () => {
  it('retries the upload before giving up, then lets the user retry or dismiss', async () => {
    vi.useFakeTimers();
    try {
      useFetch(500);
      state.session = { id: 'u1', sessionToken: 'token' };
      setIdentity('u1');
      markReady();
      const listener = vi.fn();
      actions.subscribeFailedPendingPhoto(listener);

      actions.queuePendingMyPhoto(webp());
      await vi.advanceTimersByTimeAsync(10000);

      expect(fetchMock).toHaveBeenCalledTimes(actions.PENDING_PHOTO_RETRY_DELAYS_MS.length + 1);
      expect(actions.hasFailedPendingPhoto()).toBe(true);
      expect(listener).toHaveBeenCalled();

      useFetch(201);
      actions.retryFailedPendingPhoto();
      expect(actions.hasFailedPendingPhoto()).toBe(false);
      await vi.advanceTimersByTimeAsync(100);
      expect(state.published).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('forgets the failed photo on dismiss and on logout', async () => {
    vi.useFakeTimers();
    try {
      useFetch(500);
      state.session = { id: 'u1', sessionToken: 'token' };
      setIdentity('u1');
      markReady();
      actions.queuePendingMyPhoto(webp());
      await vi.advanceTimersByTimeAsync(10000);
      expect(actions.hasFailedPendingPhoto()).toBe(true);

      actions.dismissFailedPendingPhoto();
      expect(actions.hasFailedPendingPhoto()).toBe(false);

      actions.queuePendingMyPhoto(webp());
      await vi.advanceTimersByTimeAsync(10000);
      expect(actions.hasFailedPendingPhoto()).toBe(true);
      setIdentity(null);
      expect(actions.hasFailedPendingPhoto()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never moves the photo to another account that signs in while it retries', async () => {
    vi.useFakeTimers();
    try {
      useFetch(500);
      state.session = { id: 'u1', sessionToken: 'token' };
      setIdentity('u1');
      markReady();
      actions.queuePendingMyPhoto(webp());
      await vi.advanceTimersByTimeAsync(100);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      useFetch(201);
      setIdentity(null);
      state.session = { id: 'u2', sessionToken: 'token-2' };
      setIdentity('u2');
      await vi.advanceTimersByTimeAsync(10000);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(state.published).toHaveLength(0);
      expect(actions.hasFailedPendingPhoto()).toBe(false);
      actions.retryFailedPendingPhoto();
      await vi.advanceTimersByTimeAsync(100);
      expect(state.published).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    [{ code: 'upload.tooLarge', params: { kind: 'avatar' } }, 400],
    [{ code: 'upload.newAccountQuotaExceeded' }, 507],
  ])('gives up right away on errors that a retry cannot fix (%o)', async (payload, status) => {
    vi.useFakeTimers();
    try {
      fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(payload), { status })));
      vi.stubGlobal('fetch', fetchMock);
      state.session = { id: 'u1', sessionToken: 'token' };
      setIdentity('u1');
      markReady();
      actions.queuePendingMyPhoto(webp());
      await vi.advanceTimersByTimeAsync(100);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(actions.hasFailedPendingPhoto()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
