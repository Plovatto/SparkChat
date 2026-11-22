import { openAuthenticatedField } from '../../../lib/e2ee/authenticated-field';
import { forgetCachedWrappingKey, loadContactPin, loadRoomKeyGenerations } from '../../../lib/e2ee/key-store';
import { getSodium } from '../../../lib/e2ee/sodium';
import { readNotificationLanguage, readNotificationMirror, rememberMessageId } from '../lib/notification-mirror';
import { resolveMessagePreview, type PreviewDeps } from './message-preview';
import { OFFLINE_PAGE_PATH } from './protocol';
import {
  createWorkerState,
  handleClientMessage,
  handleNavigation,
  handleNotificationClick,
  handlePush,
  readCachedRoomIcon,
  type WorkerEnvironment,
  type WorkerNotification,
  type WorkerNotificationOptions,
  type WorkerWindowClient,
  resolveWorkerLanguage,
} from './sw-handlers';

declare const __SW_VERSION__: string;
declare const __SW_API_URL__: string;

function declineCallOnServer(callId: string, token: string): Promise<void> {
  const base = __SW_API_URL__.replace(/\/+$/, '');
  if (!base) {
    return Promise.resolve();
  }
  return fetch(`${base}/api/calls/decline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callId, token }),
    credentials: 'omit',
    keepalive: true,
  }).then(() => undefined);
}

interface ExtendableEvent extends Event {
  waitUntil: (promise: Promise<unknown>) => void;
}

interface PushEvent extends ExtendableEvent {
  data: { json: () => unknown } | null;
}

interface NotificationEvent extends ExtendableEvent {
  notification: WorkerNotification;
  action: string;
}

interface FetchEvent extends ExtendableEvent {
  request: Request;
  respondWith: (response: Promise<Response>) => void;
}

interface MessageEvent extends ExtendableEvent {
  data: unknown;
  source: { id?: string } | null;
}

interface PushSubscriptionChangeEvent extends ExtendableEvent {
  oldSubscription?: PushSubscription | null;
  newSubscription?: PushSubscription | null;
}

interface WorkerGlobal {
  registration: {
    scope: string;
    showNotification: (title: string, options: WorkerNotificationOptions) => Promise<void>;
    getNotifications: (filter: { tag: string }) => Promise<WorkerNotification[]>;
    pushManager: PushManager;
  };
  clients: {
    matchAll: (options: { type: 'window'; includeUncontrolled: boolean }) => Promise<WorkerWindowClient[]>;
    openWindow: (url: string) => Promise<unknown>;
    claim: () => Promise<void>;
  };
  caches: CacheStorage;
  navigator: { language?: string };
  location: { origin: string };
  skipWaiting: () => Promise<void>;
  addEventListener: (type: string, listener: (event: never) => void) => void;
}

const worker = globalThis as unknown as WorkerGlobal;
const VERSION = typeof __SW_VERSION__ === 'string' ? __SW_VERSION__ : 'dev';
const OFFLINE_CACHE_PREFIX = 'sparkchat-offline-';
const OFFLINE_CACHE = `${OFFLINE_CACHE_PREFIX}${VERSION}`;
const PREFERENCES_CACHE = 'sparkchat-sw-preferences';
const LANGUAGE_KEY = 'language';
const offlineUrl = new URL(OFFLINE_PAGE_PATH, worker.registration.scope).href;
const languageUrl = new URL(LANGUAGE_KEY, `${worker.registration.scope}__sw/`).href;
const state = createWorkerState();

function maxActions(): number {
  const value = (globalThis as { Notification?: { maxActions?: number } }).Notification?.maxActions;
  return typeof value === 'number' ? value : 0;
}

async function loadRoomKey(roomId: string, keyId: string): Promise<Uint8Array | null> {
  const generations = await loadRoomKeyGenerations(roomId);
  let found: Uint8Array | null = null;
  for (const generation of generations) {
    if (generation.keyId === keyId && !found) {
      found = generation.key;
    } else {
      generation.key.fill(0);
    }
  }
  return found;
}

async function loadSigningKey(ownerId: string, senderId: string): Promise<Uint8Array | null> {
  const pin = await loadContactPin(ownerId, senderId);
  if (!pin?.signingPublicKey) {
    return null;
  }
  const sodium = await getSodium();
  return sodium.from_base64(pin.signingPublicKey);
}

const previewDeps: PreviewDeps = {
  readMirror: readNotificationMirror,
  loadRoomKey,
  loadSigningKey,
  openField: openAuthenticatedField,
  rememberMessage: rememberMessageId,
};

async function readLanguage(): Promise<'pt' | 'en'> {
  const mirrored = await readNotificationLanguage();
  if (mirrored) {
    return mirrored;
  }
  const cache = await worker.caches.open(PREFERENCES_CACHE);
  const stored = await cache.match(languageUrl);
  const value = stored ? await stored.text() : null;
  return resolveWorkerLanguage(value, worker.navigator.language);
}

async function saveLanguage(language: 'pt' | 'en'): Promise<void> {
  const cache = await worker.caches.open(PREFERENCES_CACHE);
  await cache.put(languageUrl, new Response(language, { headers: { 'Content-Type': 'text/plain' } }));
}

const env: WorkerEnvironment = {
  scope: worker.registration.scope,
  showNotification: (title, options) => worker.registration.showNotification(title, options),
  getNotifications: (tag) => worker.registration.getNotifications({ tag }),
  roomIcon: (roomId) => readCachedRoomIcon(worker.caches, roomId),
  windowClients: () => worker.clients.matchAll({ type: 'window', includeUncontrolled: true }),
  openWindow: (url) => worker.clients.openWindow(url),
  maxActions,
  language: readLanguage,
  saveLanguage,
  now: () => Date.now(),
  declineCall: declineCallOnServer,
  previewMessage: (roomId, preview, strings) => {
    forgetCachedWrappingKey();
    return resolveMessagePreview(roomId, preview, strings, previewDeps);
  },
};

function readPushData(event: PushEvent): unknown {
  try {
    return event.data?.json() ?? null;
  } catch {
    return null;
  }
}

worker.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    worker.caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(offlineUrl, { cache: 'reload' })))
      .catch(() => undefined)
      .then(() => worker.skipWaiting()),
  );
});

worker.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    worker.caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(OFFLINE_CACHE_PREFIX) && key !== OFFLINE_CACHE).map((key) => worker.caches.delete(key))))
      .then(() => worker.clients.claim()),
  );
});

worker.addEventListener('fetch', (event: FetchEvent) => {
  const { request } = event;
  if (request.mode !== 'navigate' || request.method !== 'GET' || !request.url.startsWith(worker.registration.scope)) {
    return;
  }
  event.respondWith(
    handleNavigation(
      () => fetch(request),
      () => worker.caches.match(offlineUrl, { cacheName: OFFLINE_CACHE }),
    ),
  );
});

worker.addEventListener('push', (event: PushEvent) => {
  event.waitUntil(handlePush(env, state, readPushData(event)));
});

worker.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.waitUntil(handleNotificationClick(env, event.notification, event.action ?? ''));
});

worker.addEventListener('message', (event: MessageEvent) => {
  event.waitUntil(handleClientMessage(env, state, event.source?.id ?? null, event.data));
});

worker.addEventListener('pushsubscriptionchange', (event: PushSubscriptionChangeEvent) => {
  const applicationServerKey = event.oldSubscription?.options.applicationServerKey ?? null;
  const resubscribe = event.newSubscription
    ? Promise.resolve(event.newSubscription)
    : applicationServerKey
      ? worker.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
      : Promise.resolve(null);
  event.waitUntil(
    resubscribe
      .catch(() => null)
      .then(() => env.windowClients())
      .then((clients) => clients.forEach((client) => client.postMessage({ type: 'sparkchat:push-subscription-changed' }))),
  );
});
