import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CacheNamespace from './notification-icon-cache';
import type * as SyncNamespace from './notification-icon-sync';

const store = vi.hoisted(() => ({
  photos: new Map<string, string | null>(),
  privateRooms: new Map<string, string[]>(),
  listeners: new Set<(change: { kind: string; id?: string }) => void>(),
}));

vi.mock('@lib/e2ee', () => ({
  getRoomPhotoUrl: (roomId: string) => store.photos.get(roomId) ?? null,
  privateRoomsWith: (userId: string) => store.privateRooms.get(userId) ?? [],
  subscribeProfilePhotos: (listener: (change: { kind: string; id?: string }) => void) => {
    store.listeners.add(listener);
    return () => store.listeners.delete(listener);
  },
}));

class FakeCache {
  readonly entries = new Map<string, Response>();

  put(request: string, response: Response): Promise<void> {
    this.entries.set(request, response);
    return Promise.resolve();
  }

  delete(request: string): Promise<boolean> {
    return Promise.resolve(this.entries.delete(request));
  }
}

class FakeCacheStorage {
  readonly caches = new Map<string, FakeCache>();

  open(name: string): Promise<FakeCache> {
    const cache = this.caches.get(name) ?? new FakeCache();
    this.caches.set(name, cache);
    return Promise.resolve(cache);
  }

  has(name: string): Promise<boolean> {
    return Promise.resolve(this.caches.has(name));
  }

  delete(name: string): Promise<boolean> {
    return Promise.resolve(this.caches.delete(name));
  }
}

let storage: FakeCacheStorage;
let cacheModule: typeof CacheNamespace;
let syncModule: typeof SyncNamespace;

function emit(change: { kind: string; id?: string }): void {
  for (const listener of Array.from(store.listeners)) {
    listener(change);
  }
}

beforeEach(async () => {
  vi.resetModules();
  store.photos.clear();
  store.privateRooms.clear();
  store.listeners.clear();
  storage = new FakeCacheStorage();
  vi.stubGlobal('caches', storage);
  cacheModule = await import('./notification-icon-cache');
  syncModule = await import('./notification-icon-sync');
});

afterEach(() => {
  syncModule.stopNotificationIconSync();
  vi.unstubAllGlobals();
});

function iconCache(): FakeCache | undefined {
  return storage.caches.get('sparkchat-notification-icons');
}

describe('notification icon cache', () => {
  it('stores a PNG under the room icon URL and deletes it again', async () => {
    expect(cacheModule.NOTIFICATION_ICON_CACHE_NAME).toBe('sparkchat-notification-icons');
    expect(cacheModule.notificationIconUrl('room-1')).toBe('/app/__notification-icon/room-1');

    expect(await cacheModule.writeNotificationIcon('room-1', new Blob(['png'], { type: 'image/png' }))).toBe(true);
    const response = iconCache()?.entries.get('/app/__notification-icon/room-1');
    expect(response?.headers.get('Content-Type')).toBe('image/png');
    expect(await response?.text()).toBe('png');

    expect(await cacheModule.deleteNotificationIcon('room-1')).toBe(true);
    expect(iconCache()?.entries.size).toBe(0);
  });

  it('wipes the whole cache', async () => {
    await cacheModule.writeNotificationIcon('room-1', new Blob(['png']));
    await cacheModule.clearNotificationIcons();
    expect(iconCache()).toBeUndefined();
  });

  it('does nothing where Cache Storage is unavailable', async () => {
    vi.stubGlobal('caches', undefined);
    expect(await cacheModule.writeNotificationIcon('room-1', new Blob(['png']))).toBe(false);
    expect(await cacheModule.deleteNotificationIcon('room-1')).toBe(false);
    await expect(cacheModule.clearNotificationIcons()).resolves.toBeUndefined();
  });
});

describe('notification icon sync', () => {
  it('writes the room photo icon, follows the other user of a private room and deletes it when removed', async () => {
    const render = vi.fn((url: string, size: number) => Promise.resolve(new Blob([`${url}@${size}`], { type: 'image/png' })));
    syncModule.startNotificationIconSync(render);

    store.photos.set('group-1', 'blob:group');
    emit({ kind: 'room', id: 'group-1' });
    store.photos.set('dm-1', 'blob:alice');
    store.privateRooms.set('alice', ['dm-1']);
    emit({ kind: 'user', id: 'alice' });
    await syncModule.settleNotificationIconSync();

    expect(render).toHaveBeenCalledWith('blob:group', 192);
    expect(await iconCache()?.entries.get('/app/__notification-icon/group-1')?.text()).toBe('blob:group@192');
    expect(await iconCache()?.entries.get('/app/__notification-icon/dm-1')?.text()).toBe('blob:alice@192');

    store.photos.set('dm-1', null);
    emit({ kind: 'user', id: 'alice' });
    await syncModule.settleNotificationIconSync();
    expect(iconCache()?.entries.has('/app/__notification-icon/dm-1')).toBe(false);
    expect(iconCache()?.entries.has('/app/__notification-icon/group-1')).toBe(true);
  });

  it('wipes every icon when the photo store is reset on logout', async () => {
    syncModule.startNotificationIconSync(() => Promise.resolve(new Blob(['png'])));
    store.photos.set('group-1', 'blob:group');
    emit({ kind: 'room', id: 'group-1' });
    await syncModule.settleNotificationIconSync();
    expect(iconCache()?.entries.size).toBe(1);

    emit({ kind: 'reset' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(iconCache()).toBeUndefined();
  });
});
