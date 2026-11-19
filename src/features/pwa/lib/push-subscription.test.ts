import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PUSH_ENDPOINT_STORAGE_KEY, PUSH_OPT_OUT_STORAGE_KEY } from '@constants/storage-keys';
import {
  base64UrlToBytes,
  disablePush,
  emitPushUnsubscribeForLogout,
  enablePushFromGesture,
  ensurePushSubscription,
  isPushOptedOut,
  PushSetupError,
  requestPushConfig,
  syncPushSubscription,
  type PushDeps,
  type PushRegistration,
} from './push-subscription';

const PUBLIC_KEY = 'BDd3_hVL9fZi9Ybo2UUzA284WG5FZR30_95YeZJsiApwXKpNcF1rRPF3foIiBHXRdJI2Qhumhf6_LFTeZaNndIo';

type Handler = (payload: unknown) => void;

class FakeSocket {
  readonly emitted: { event: string; payload: unknown }[] = [];
  private readonly handlers = new Map<string, Set<Handler>>();
  constructor(private readonly reply: (socket: FakeSocket, event: string, payload: unknown) => void = () => undefined) {}

  on(event: string, handler: Handler) {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler);
    this.handlers.set(event, set);
    return this;
  }

  off(event: string, handler: Handler) {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  emit(event: string, payload?: unknown) {
    this.emitted.push({ event, payload });
    this.reply(this, event, payload);
    return this;
  }

  receive(event: string, payload: unknown) {
    [...(this.handlers.get(event) ?? [])].forEach((handler) => handler(payload));
  }

  listenerCount(event: string): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  sent(event: string): unknown[] {
    return this.emitted.filter((entry) => entry.event === event).map((entry) => entry.payload);
  }
}

function serverSocket(config: { enabled: boolean; publicKey: string | null } = { enabled: true, publicKey: PUBLIC_KEY }, rejectSubscribe = false) {
  return new FakeSocket((socket, event, payload) => {
    queueMicrotask(() => {
      if (event === 'push:config') {
        socket.receive('push:config', config);
      }
      if (event === 'push:subscribe') {
        if (rejectSubscribe) {
          socket.receive('error', { message: 'x', code: 'push.invalidSubscription', event: 'push:subscribe' });
        } else {
          socket.receive('push:subscribed', { endpoint: (payload as { subscription: { endpoint: string } }).subscription.endpoint });
        }
      }
    });
  });
}

function fakeSubscription(endpoint: string, key: Uint8Array) {
  const subscription = {
    endpoint,
    options: { applicationServerKey: key.buffer.slice(0) },
    unsubscribe: vi.fn(() => Promise.resolve(true)),
    toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: 'p256', auth: 'auth' } }),
  };
  return subscription;
}

function fakeRegistration(existing: ReturnType<typeof fakeSubscription> | null = null, nextEndpoint = 'https://fcm.googleapis.com/fcm/send/new') {
  let current = existing;
  const subscribe = vi.fn((options: PushSubscriptionOptionsInit) => {
    current = fakeSubscription(nextEndpoint, new Uint8Array(options.applicationServerKey as ArrayBuffer));
    return Promise.resolve(current as unknown as PushSubscription);
  });
  const registration: PushRegistration = {
    pushManager: {
      getSubscription: vi.fn(() => Promise.resolve(current as unknown as PushSubscription | null)),
      subscribe,
    },
  };
  return { registration, subscribe };
}

function deps(registration: PushRegistration | null): PushDeps {
  return { getRegistration: () => Promise.resolve(registration) };
}

let storage: Map<string, string>;

beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('base64UrlToBytes', () => {
  it('decodes an unpadded VAPID public key to 65 bytes', () => {
    const bytes = base64UrlToBytes(PUBLIC_KEY);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(4);
  });
});

describe('requestPushConfig', () => {
  it('emits push:config without a payload and resolves with the server answer', async () => {
    const socket = serverSocket();
    await expect(requestPushConfig(socket as never)).resolves.toEqual({ enabled: true, publicKey: PUBLIC_KEY });
    expect(socket.emitted).toEqual([{ event: 'push:config', payload: undefined }]);
    expect(socket.listenerCount('push:config')).toBe(0);
  });

  it('shares one request per socket', async () => {
    const socket = serverSocket();
    const first = requestPushConfig(socket as never);
    const second = requestPushConfig(socket as never);
    expect(second).toBe(first);
    await first;
    expect(socket.sent('push:config')).toHaveLength(1);
  });

  it('treats a missing key or an old server that never answers as disabled', async () => {
    await expect(requestPushConfig(serverSocket({ enabled: true, publicKey: null }) as never)).resolves.toEqual({ enabled: false, publicKey: null });

    vi.useFakeTimers();
    const silent = new FakeSocket();
    const pending = requestPushConfig(silent as never, 1000);
    vi.advanceTimersByTime(1000);
    await expect(pending).resolves.toEqual({ enabled: false, publicKey: null });
    expect(silent.listenerCount('push:config')).toBe(0);
  });
});

describe('ensurePushSubscription', () => {
  it('subscribes with the server key and sends the subscription JSON', async () => {
    const socket = serverSocket();
    const { registration, subscribe } = fakeRegistration();
    const endpoint = await ensurePushSubscription(socket as never, { enabled: true, publicKey: PUBLIC_KEY }, deps(registration));

    expect(endpoint).toBe('https://fcm.googleapis.com/fcm/send/new');
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(PUBLIC_KEY) });
    expect(socket.sent('push:subscribe')).toEqual([
      { subscription: { endpoint, expirationTime: null, keys: { p256dh: 'p256', auth: 'auth' } } },
    ]);
    expect(storage.get(PUSH_ENDPOINT_STORAGE_KEY)).toBe(endpoint);
    expect(socket.listenerCount('push:subscribed')).toBe(0);
    expect(socket.listenerCount('error')).toBe(0);
  });

  it('reuses a matching subscription and re-sends it so the server moves it to this account', async () => {
    const socket = serverSocket();
    const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/old', base64UrlToBytes(PUBLIC_KEY));
    const { registration, subscribe } = fakeRegistration(existing);
    await ensurePushSubscription(socket as never, { enabled: true, publicKey: PUBLIC_KEY }, deps(registration));
    expect(subscribe).not.toHaveBeenCalled();
    expect(existing.unsubscribe).not.toHaveBeenCalled();
    expect(socket.sent('push:subscribe')).toHaveLength(1);
  });

  it('replaces a subscription made with another server key and drops the stale endpoint on the server', async () => {
    storage.set(PUSH_ENDPOINT_STORAGE_KEY, 'https://fcm.googleapis.com/fcm/send/old');
    const socket = serverSocket();
    const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/old', new Uint8Array(65));
    const { registration, subscribe } = fakeRegistration(existing);
    await ensurePushSubscription(socket as never, { enabled: true, publicKey: PUBLIC_KEY }, deps(registration));
    expect(existing.unsubscribe).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalled();
    expect(socket.sent('push:unsubscribe')).toEqual([{ endpoint: 'https://fcm.googleapis.com/fcm/send/old' }]);
    expect(storage.get(PUSH_ENDPOINT_STORAGE_KEY)).toBe('https://fcm.googleapis.com/fcm/send/new');
  });

  it('reports server rejections with the error payload and does not store the endpoint', async () => {
    const socket = serverSocket(undefined, true);
    const { registration } = fakeRegistration();
    const failure = await ensurePushSubscription(socket as never, { enabled: true, publicKey: PUBLIC_KEY }, deps(registration)).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PushSetupError);
    expect((failure as PushSetupError).code).toBe('server-rejected');
    expect((failure as PushSetupError).serverError?.code).toBe('push.invalidSubscription');
    expect(storage.has(PUSH_ENDPOINT_STORAGE_KEY)).toBe(false);
  });

  it('fails clearly without a service worker or when disabled', async () => {
    await expect(ensurePushSubscription(serverSocket() as never, { enabled: true, publicKey: PUBLIC_KEY }, deps(null))).rejects.toMatchObject({ code: 'no-service-worker' });
    await expect(ensurePushSubscription(serverSocket() as never, { enabled: false, publicKey: null }, deps(null))).rejects.toMatchObject({ code: 'disabled' });
  });
});

describe('enablePushFromGesture', () => {
  it('asks for permission synchronously inside the click before anything else is awaited', async () => {
    const socket = serverSocket();
    const order: string[] = [];
    const { registration } = fakeRegistration();
    const requestPermission = vi.fn(() => {
      order.push('permission');
      return Promise.resolve('granted' as NotificationPermission);
    });
    const result = enablePushFromGesture(socket as never, requestPushConfig(socket as never), {
      ...deps(registration),
      currentPermission: () => 'default',
      requestPermission,
    });
    order.push('returned');
    expect(order).toEqual(['permission', 'returned']);
    await expect(result).resolves.toMatchObject({ permission: 'granted', endpoint: 'https://fcm.googleapis.com/fcm/send/new' });
  });

  it('stops when the user denies and never subscribes', async () => {
    const socket = serverSocket();
    const { registration, subscribe } = fakeRegistration();
    const result = await enablePushFromGesture(socket as never, requestPushConfig(socket as never), {
      ...deps(registration),
      currentPermission: () => 'default',
      requestPermission: () => Promise.resolve('denied'),
    });
    expect(result).toEqual({ permission: 'denied', endpoint: null });
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('grants permission but skips subscribing when the server has push disabled', async () => {
    const socket = serverSocket({ enabled: false, publicKey: null });
    const { registration, subscribe } = fakeRegistration();
    const result = await enablePushFromGesture(socket as never, requestPushConfig(socket as never), {
      ...deps(registration),
      currentPermission: () => 'granted',
      requestPermission: () => Promise.reject(new Error('should not ask')),
    });
    expect(result).toEqual({ permission: 'granted', endpoint: null });
    expect(subscribe).not.toHaveBeenCalled();
  });
});

describe('syncPushSubscription', () => {
  function stubBrowser(permission: NotificationPermission) {
    vi.stubGlobal('window', { PushManager: class {}, Notification: { permission } });
    vi.stubGlobal('navigator', { serviceWorker: {} });
    vi.stubGlobal('Notification', { permission });
  }

  it('subscribes silently on app open when permission is already granted', async () => {
    stubBrowser('granted');
    const socket = serverSocket();
    const { registration } = fakeRegistration();
    await expect(syncPushSubscription(socket as never, deps(registration))).resolves.toBe('https://fcm.googleapis.com/fcm/send/new');
    expect(socket.sent('push:subscribe')).toHaveLength(1);
  });

  it('does nothing while permission is default or denied, or after the user turned it off', async () => {
    for (const permission of ['default', 'denied'] as const) {
      stubBrowser(permission);
      const socket = serverSocket();
      await expect(syncPushSubscription(socket as never, deps(fakeRegistration().registration))).resolves.toBeNull();
      expect(socket.emitted).toEqual([]);
    }
    stubBrowser('granted');
    storage.set(PUSH_OPT_OUT_STORAGE_KEY, 'true');
    const socket = serverSocket();
    await expect(syncPushSubscription(socket as never, deps(fakeRegistration().registration))).resolves.toBeNull();
    expect(socket.emitted).toEqual([]);
  });
});

describe('disable and logout', () => {
  it('turning the switch off unsubscribes on the server and in the browser and remembers the choice', async () => {
    storage.set(PUSH_ENDPOINT_STORAGE_KEY, 'https://fcm.googleapis.com/fcm/send/old');
    const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/old', base64UrlToBytes(PUBLIC_KEY));
    const { registration } = fakeRegistration(existing);
    const socket = new FakeSocket();
    await disablePush(socket as never, deps(registration));
    expect(socket.sent('push:unsubscribe')).toEqual([{ endpoint: 'https://fcm.googleapis.com/fcm/send/old' }]);
    expect(existing.unsubscribe).toHaveBeenCalled();
    expect(isPushOptedOut()).toBe(true);
    expect(storage.has(PUSH_ENDPOINT_STORAGE_KEY)).toBe(false);
  });

  it('logout tells the server to drop this device endpoint before the session ends', () => {
    const socket = new FakeSocket();
    emitPushUnsubscribeForLogout(socket as never);
    expect(socket.emitted).toEqual([]);
    storage.set(PUSH_ENDPOINT_STORAGE_KEY, 'https://fcm.googleapis.com/fcm/send/old');
    emitPushUnsubscribeForLogout(socket as never);
    expect(socket.sent('push:unsubscribe')).toEqual([{ endpoint: 'https://fcm.googleapis.com/fcm/send/old' }]);
    expect(() => emitPushUnsubscribeForLogout(null)).not.toThrow();
  });
});
