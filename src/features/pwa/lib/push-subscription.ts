import { PUSH_ENDPOINT_STORAGE_KEY, PUSH_OPT_OUT_STORAGE_KEY } from '@constants/storage-keys';
import type { AppSocket, PushConfigPayload, SocketErrorPayload } from '@lib/socket';
import { SW_SCOPE } from '../sw/protocol';

export const PUSH_CONFIG_TIMEOUT_MS = 6000;
export const PUSH_SUBSCRIBE_TIMEOUT_MS = 10000;
export const SERVICE_WORKER_READY_TIMEOUT_MS = 10000;

export type PushErrorCode = 'unsupported' | 'disabled' | 'denied' | 'no-service-worker' | 'subscribe-failed' | 'server-rejected' | 'timeout';

export class PushSetupError extends Error {
  constructor(
    readonly code: PushErrorCode,
    readonly serverError: SocketErrorPayload | null = null,
  ) {
    super(`Push setup failed: ${code}`);
    this.name = 'PushSetupError';
  }
}

export interface PushRegistration {
  pushManager: Pick<PushManager, 'getSubscription' | 'subscribe'>;
}

export interface PushDeps {
  getRegistration: () => Promise<PushRegistration | null>;
}

type PushSocket = Pick<AppSocket, 'on' | 'off' | 'emit'>;

const pushStateListeners = new Set<() => void>();

export function subscribePushState(listener: () => void): () => void {
  pushStateListeners.add(listener);
  return () => {
    pushStateListeners.delete(listener);
  };
}

function notifyPushState(): void {
  pushStateListeners.forEach((listener) => listener());
}

const DISABLED_CONFIG: PushConfigPayload = { enabled: false, publicKey: null };
const configRequests = new WeakMap<object, Promise<PushConfigPayload>>();

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function currentNotificationPermission(): NotificationPermission {
  return isNotificationSupported() ? Notification.permission : 'denied';
}

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function sameKey(current: ArrayBuffer | null | undefined, expected: Uint8Array): boolean {
  if (!current) {
    return false;
  }
  const bytes = new Uint8Array(current);
  return bytes.length === expected.length && bytes.every((byte, index) => byte === expected[index]);
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    return;
  }
}

export function storedPushEndpoint(): string | null {
  return readStorage(PUSH_ENDPOINT_STORAGE_KEY);
}

export function isPushOptedOut(): boolean {
  return readStorage(PUSH_OPT_OUT_STORAGE_KEY) === 'true';
}

export function requestPushConfig(socket: PushSocket, timeoutMs = PUSH_CONFIG_TIMEOUT_MS): Promise<PushConfigPayload> {
  const cached = configRequests.get(socket);
  if (cached) {
    return cached;
  }
  const request = new Promise<PushConfigPayload>((resolve) => {
    const finish = (config: PushConfigPayload) => {
      clearTimeout(timer);
      socket.off('push:config', handleConfig);
      resolve(config);
    };
    const handleConfig = (payload: PushConfigPayload) => {
      const enabled = payload?.enabled === true && typeof payload.publicKey === 'string' && payload.publicKey.length > 0;
      finish(enabled ? { enabled: true, publicKey: payload.publicKey } : DISABLED_CONFIG);
    };
    const timer = setTimeout(() => {
      configRequests.delete(socket);
      finish(DISABLED_CONFIG);
    }, timeoutMs);
    socket.on('push:config', handleConfig);
    socket.emit('push:config');
  });
  configRequests.set(socket, request);
  return request;
}

export function forgetPushConfig(socket: object): void {
  configRequests.delete(socket);
}

function waitForSubscribed(socket: PushSocket, endpoint: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('push:subscribed', handleSubscribed);
      socket.off('error', handleError);
    };
    const handleSubscribed = (payload: { endpoint: string }) => {
      if (payload?.endpoint === endpoint) {
        cleanup();
        resolve();
      }
    };
    const handleError = (payload: SocketErrorPayload) => {
      if (payload?.event === 'push:subscribe') {
        cleanup();
        reject(new PushSetupError('server-rejected', payload));
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new PushSetupError('timeout'));
    }, timeoutMs);
    socket.on('push:subscribed', handleSubscribed);
    socket.on('error', handleError);
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export async function getServiceWorkerRegistration(timeoutMs = SERVICE_WORKER_READY_TIMEOUT_MS): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  const existing = await navigator.serviceWorker.getRegistration(SW_SCOPE).catch(() => undefined);
  if (existing?.active) {
    return existing;
  }
  return withTimeout<ServiceWorkerRegistration | null>(navigator.serviceWorker.ready, timeoutMs, null);
}

const defaultDeps: PushDeps = { getRegistration: () => getServiceWorkerRegistration() };

export async function ensurePushSubscription(socket: PushSocket, config: PushConfigPayload, deps: PushDeps = defaultDeps): Promise<string> {
  if (!config.enabled || !config.publicKey) {
    throw new PushSetupError('disabled');
  }
  const registration = await deps.getRegistration();
  if (!registration) {
    throw new PushSetupError('no-service-worker');
  }
  const applicationServerKey = base64UrlToBytes(config.publicKey);
  let subscription: PushSubscription | null = await registration.pushManager.getSubscription();
  if (subscription && !sameKey(subscription.options?.applicationServerKey, applicationServerKey)) {
    await subscription.unsubscribe().catch(() => false);
    subscription = null;
  }
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    } catch {
      throw new PushSetupError('subscribe-failed');
    }
  }
  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    throw new PushSetupError('subscribe-failed');
  }
  const previous = storedPushEndpoint();
  if (previous && previous !== endpoint) {
    socket.emit('push:unsubscribe', { endpoint: previous });
  }
  const confirmation = waitForSubscribed(socket, endpoint, PUSH_SUBSCRIBE_TIMEOUT_MS);
  socket.emit('push:subscribe', { subscription: { endpoint, expirationTime: json.expirationTime ?? null, keys: { p256dh, auth } } });
  await confirmation;
  writeStorage(PUSH_ENDPOINT_STORAGE_KEY, endpoint);
  writeStorage(PUSH_OPT_OUT_STORAGE_KEY, null);
  notifyPushState();
  return endpoint;
}

export interface EnableFromGestureDeps extends PushDeps {
  requestPermission: () => Promise<NotificationPermission>;
  currentPermission: () => NotificationPermission;
}

export function enablePushFromGesture(
  socket: PushSocket,
  configPromise: Promise<PushConfigPayload>,
  deps: EnableFromGestureDeps,
): Promise<{ permission: NotificationPermission; endpoint: string | null }> {
  const current = deps.currentPermission();
  const permissionPromise = current === 'default' ? deps.requestPermission() : Promise.resolve(current);
  return permissionPromise.then(async (permission) => {
    if (permission !== 'granted') {
      return { permission, endpoint: null };
    }
    const config = await configPromise;
    if (!config.enabled) {
      return { permission, endpoint: null };
    }
    const endpoint = await ensurePushSubscription(socket, config, deps);
    return { permission, endpoint };
  });
}

export async function disablePush(socket: PushSocket | null, deps: PushDeps = defaultDeps): Promise<void> {
  const endpoint = storedPushEndpoint();
  writeStorage(PUSH_OPT_OUT_STORAGE_KEY, 'true');
  writeStorage(PUSH_ENDPOINT_STORAGE_KEY, null);
  const registration = await deps.getRegistration().catch(() => null);
  const subscription = await registration?.pushManager.getSubscription().catch(() => null);
  const endpoints = new Set([endpoint, subscription?.endpoint].filter((value): value is string => Boolean(value)));
  endpoints.forEach((value) => socket?.emit('push:unsubscribe', { endpoint: value }));
  await subscription?.unsubscribe().catch(() => false);
  notifyPushState();
}

export function emitPushUnsubscribeForLogout(socket: PushSocket | null): void {
  const endpoint = storedPushEndpoint();
  if (socket && endpoint) {
    socket.emit('push:unsubscribe', { endpoint });
  }
}

export async function clearLocalPushSubscription(): Promise<void> {
  writeStorage(PUSH_ENDPOINT_STORAGE_KEY, null);
  notifyPushState();
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }
  const registration = await navigator.serviceWorker.getRegistration(SW_SCOPE).catch(() => undefined);
  const subscription = await registration?.pushManager.getSubscription().catch(() => null);
  await subscription?.unsubscribe().catch(() => false);
}

export async function syncPushSubscription(socket: PushSocket, deps: PushDeps = defaultDeps): Promise<string | null> {
  if (!isPushSupported() || currentNotificationPermission() !== 'granted' || isPushOptedOut()) {
    return null;
  }
  const config = await requestPushConfig(socket);
  if (!config.enabled) {
    return null;
  }
  return ensurePushSubscription(socket, config, deps);
}
