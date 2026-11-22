import {
  buildLaunchUrl,
  isClientToWorkerMessage,
  isSafeId,
  NOTIFICATION_ACTION_ANSWER,
  NOTIFICATION_ACTION_DECLINE,
  type WorkerToClientMessage,
} from './protocol';
import type { NotificationText, PushMessagePreview } from './message-preview';
import { NOTIFICATION_ICON_CACHE_NAME, notificationIconUrl } from '../../profile-photos/lib/notification-icon-cache';
import { WORKER_STRINGS, type WorkerStrings } from './sw-strings';

export type PushMessage =
  | { t: 'call'; callId: string; roomId: string; kind: 'voice' | 'video'; d?: string }
  | { t: 'call-end'; callId: string; reason: string }
  | { t: 'msg'; roomId: string; preview?: PushMessagePreview };

export type NotificationData =
  | { kind: 'call'; callId: string; roomId: string }
  | { kind: 'missed'; callId: string; roomId?: string }
  | { kind: 'msg'; roomId: string }
  | { kind: 'generic' };

export interface WorkerNotificationOptions {
  body?: string;
  tag?: string;
  icon?: string;
  badge?: string;
  lang?: string;
  data?: NotificationData;
  silent?: boolean;
  renotify?: boolean;
  requireInteraction?: boolean;
  vibrate?: number[];
  actions?: { action: string; title: string }[];
  timestamp?: number;
}

export interface WorkerNotification {
  tag: string;
  data: unknown;
  close: () => void;
}

export interface WorkerWindowClient {
  id: string;
  url: string;
  focused: boolean;
  visibilityState: string;
  focus: () => Promise<unknown>;
  postMessage: (message: WorkerToClientMessage) => void;
}

export interface WorkerEnvironment {
  scope: string;
  showNotification: (title: string, options: WorkerNotificationOptions) => Promise<void>;
  getNotifications: (tag: string) => Promise<WorkerNotification[]>;
  windowClients: () => Promise<WorkerWindowClient[]>;
  openWindow: (url: string) => Promise<unknown>;
  maxActions: () => number;
  language: () => Promise<'pt' | 'en'>;
  saveLanguage: (language: 'pt' | 'en') => Promise<void>;
  now: () => number;
  previewMessage?: (roomId: string, preview: PushMessagePreview | undefined, strings: WorkerStrings) => Promise<NotificationText | null>;
  roomIcon?: (roomId: string) => Promise<string | null>;
  declineCall?: (callId: string, token: string) => Promise<void>;
}

export interface WorkerState {
  activeRooms: Map<string, string>;
}

export const NOTIFICATION_ICON = '/icon-192.png';
export const NOTIFICATION_BADGE = '/badge-96.png';
export const CALL_VIBRATION = [400, 200, 400, 200, 400, 200, 400];
export const MISSED_CALL_REASONS: readonly string[] = ['missed', 'cancelled'];
export const MAX_ROOM_ICON_BYTES = 256 * 1024;

const HTML_LANG = { pt: 'pt-BR', en: 'en' } as const;
const PREVIEW_KINDS: readonly string[] = ['text', 'image', 'audio', 'file'];
const MAX_PREVIEW_FIELD_LENGTH = 4096;
export const PREVIEW_TIMEOUT_MS = 4000;
export const LANGUAGE_TIMEOUT_MS = 1500;

function parsePreview(raw: unknown): PushMessagePreview | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const value = raw as Record<string, unknown>;
  if (!isSafeId(value.id) || !isSafeId(value.s) || typeof value.k !== 'string' || !PREVIEW_KINDS.includes(value.k)) {
    return undefined;
  }
  const preview: PushMessagePreview = { id: value.id, senderId: value.s, kind: value.k as PushMessagePreview['kind'] };
  if (typeof value.c === 'string' && value.c.length <= MAX_PREVIEW_FIELD_LENGTH && value.c.startsWith('e2e:v2:')) {
    preview.content = value.c;
  }
  return preview;
}

export function resolveWorkerLanguage(stored: string | null, navigatorLanguage: string | undefined): 'pt' | 'en' {
  if (stored === 'pt' || stored === 'en') {
    return stored;
  }
  return (navigatorLanguage ?? '').toLowerCase().startsWith('en') ? 'en' : 'pt';
}

export function createWorkerState(): WorkerState {
  return { activeRooms: new Map() };
}

export function callTag(callId: string): string {
  return `call:${callId}`;
}

export function messageTag(roomId: string): string {
  return `msg:${roomId}`;
}

const DECLINE_TOKEN = /^[A-Za-z0-9_.-]{1,512}$/;

function isDeclineToken(value: unknown): value is string {
  return typeof value === 'string' && DECLINE_TOKEN.test(value);
}

export function parsePushMessage(raw: unknown): PushMessage | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const value = raw as Record<string, unknown>;
  switch (value.t) {
    case 'call':
      if (isSafeId(value.callId) && isSafeId(value.roomId) && (value.kind === 'voice' || value.kind === 'video')) {
        return { t: 'call', callId: value.callId, roomId: value.roomId, kind: value.kind, ...(isDeclineToken(value.d) ? { d: value.d } : {}) };
      }
      return null;
    case 'call-end':
      if (isSafeId(value.callId) && typeof value.reason === 'string' && value.reason.length <= 32) {
        return { t: 'call-end', callId: value.callId, reason: value.reason };
      }
      return null;
    case 'msg': {
      if (!isSafeId(value.roomId)) {
        return null;
      }
      const preview = parsePreview(value.m);
      return preview ? { t: 'msg', roomId: value.roomId, preview } : { t: 'msg', roomId: value.roomId };
    }
    default:
      return null;
  }
}

function baseOptions(language: 'pt' | 'en', env: WorkerEnvironment): WorkerNotificationOptions {
  return { icon: NOTIFICATION_ICON, badge: NOTIFICATION_BADGE, lang: HTML_LANG[language], timestamp: env.now() };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

export async function readCachedRoomIcon(storage: CacheStorage | undefined | null, roomId: string): Promise<string | null> {
  if (!storage || !isSafeId(roomId)) {
    return null;
  }
  try {
    if (!(await storage.has(NOTIFICATION_ICON_CACHE_NAME))) {
      return null;
    }
    const cache = await storage.open(NOTIFICATION_ICON_CACHE_NAME);
    const response = await cache.match(notificationIconUrl(roomId));
    if (!response?.ok) {
      return null;
    }
    const type = response.headers.get('Content-Type') ?? '';
    if (type !== 'image/png') {
      return null;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_ROOM_ICON_BYTES) {
      return null;
    }
    return `data:image/png;base64,${bytesToBase64(bytes)}`;
  } catch {
    return null;
  }
}

async function roomIconOr(env: WorkerEnvironment, roomId: string | undefined, fallback: string | undefined): Promise<string | undefined> {
  if (!roomId || !env.roomIcon) {
    return fallback;
  }
  const icon = await env.roomIcon(roomId).catch(() => null);
  return icon ?? fallback;
}

function roomIdOf(data: unknown): string | undefined {
  if (typeof data === 'object' && data !== null && isSafeId((data as Record<string, unknown>).roomId)) {
    return (data as { roomId: string }).roomId;
  }
  return undefined;
}

async function hasFocusedVisibleClient(env: WorkerEnvironment): Promise<boolean> {
  const clients = await env.windowClients().catch(() => []);
  return clients.some((client) => client.focused && client.visibilityState === 'visible');
}

async function showCall(env: WorkerEnvironment, strings: WorkerStrings, language: 'pt' | 'en', message: Extract<PushMessage, { t: 'call' }>): Promise<void> {
  if (await hasFocusedVisibleClient(env)) {
    return;
  }
  const base = baseOptions(language, env);
  const options: WorkerNotificationOptions = {
    ...base,
    icon: await roomIconOr(env, message.roomId, base.icon),
    body: message.kind === 'video' ? strings.videoCallBody : strings.voiceCallBody,
    tag: callTag(message.callId),
    renotify: true,
    requireInteraction: true,
    vibrate: CALL_VIBRATION,
    data: { kind: 'call', callId: message.callId, roomId: message.roomId, ...(message.d ? { declineToken: message.d } : {}) },
  };
  if (env.maxActions() >= 2) {
    options.actions = [
      { action: NOTIFICATION_ACTION_ANSWER, title: strings.answer },
      { action: NOTIFICATION_ACTION_DECLINE, title: strings.decline },
    ];
  }
  await env.showNotification(strings.incomingCall, options);
}

async function showCallEnd(env: WorkerEnvironment, strings: WorkerStrings, language: 'pt' | 'en', message: Extract<PushMessage, { t: 'call-end' }>): Promise<void> {
  const tag = callTag(message.callId);
  const existing = await env.getNotifications(tag);
  const roomId = existing.map((notification) => roomIdOf(notification.data)).find((value) => value !== undefined);
  for (const notification of existing) {
    notification.close();
  }
  if (!MISSED_CALL_REASONS.includes(message.reason)) {
    return;
  }
  const base = baseOptions(language, env);
  await env.showNotification(strings.missedCall, {
    ...base,
    icon: await roomIconOr(env, roomId, base.icon),
    body: strings.missedCallBody,
    tag,
    data: { kind: 'missed', callId: message.callId, ...(roomId ? { roomId } : {}) },
  });
}

function withinTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
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

function previewWithin(env: WorkerEnvironment, strings: WorkerStrings, message: Extract<PushMessage, { t: 'msg' }>): Promise<NotificationText | null> {
  if (!env.previewMessage || !message.preview) {
    return Promise.resolve(null);
  }
  return withinTimeout(env.previewMessage(message.roomId, message.preview, strings), PREVIEW_TIMEOUT_MS, null);
}

async function isRoomVisible(env: WorkerEnvironment, state: WorkerState, roomId: string): Promise<boolean> {
  const clients = await env.windowClients();
  return clients.some((client) => client.visibilityState === 'visible' && state.activeRooms.get(client.id) === roomId);
}

async function showMessage(
  env: WorkerEnvironment,
  state: WorkerState,
  strings: WorkerStrings,
  language: 'pt' | 'en',
  message: Extract<PushMessage, { t: 'msg' }>,
): Promise<void> {
  const [silent, text] = await Promise.all([isRoomVisible(env, state, message.roomId).catch(() => false), previewWithin(env, strings, message)]);
  const base = baseOptions(language, env);
  await env.showNotification(text?.title ?? strings.newMessage, {
    ...base,
    icon: await roomIconOr(env, message.roomId, base.icon),
    body: text?.body ?? strings.newMessageBody,
    tag: messageTag(message.roomId),
    renotify: !silent,
    silent,
    data: { kind: 'msg', roomId: message.roomId },
  });
}

async function showGeneric(env: WorkerEnvironment, strings: WorkerStrings, language: 'pt' | 'en'): Promise<void> {
  await env.showNotification(strings.generic, {
    ...baseOptions(language, env),
    body: strings.genericBody,
    tag: 'sparkchat',
    data: { kind: 'generic' },
  });
}

export async function handlePush(env: WorkerEnvironment, state: WorkerState, raw: unknown): Promise<void> {
  const language = await withinTimeout(env.language(), LANGUAGE_TIMEOUT_MS, 'pt' as const);
  const strings = WORKER_STRINGS[language];
  const message = parsePushMessage(raw);
  try {
    switch (message?.t) {
      case 'call':
        await showCall(env, strings, language, message);
        return;
      case 'call-end':
        await showCallEnd(env, strings, language, message);
        return;
      case 'msg':
        await showMessage(env, state, strings, language, message);
        return;
      default:
        await showGeneric(env, strings, language);
    }
  } catch {
    await showGeneric(env, strings, language);
  }
}

function pickClient(clients: WorkerWindowClient[]): WorkerWindowClient | undefined {
  return clients.find((client) => client.focused) ?? clients.find((client) => client.visibilityState === 'visible') ?? clients[0];
}

function readNotificationData(data: unknown): { kind?: string; callId?: string; roomId?: string; declineToken?: string } {
  if (typeof data !== 'object' || data === null) {
    return {};
  }
  const value = data as Record<string, unknown>;
  return {
    kind: typeof value.kind === 'string' ? value.kind : undefined,
    callId: isSafeId(value.callId) ? value.callId : undefined,
    roomId: isSafeId(value.roomId) ? value.roomId : undefined,
    declineToken: isDeclineToken(value.declineToken) ? value.declineToken : undefined,
  };
}

export async function handleNotificationClick(env: WorkerEnvironment, notification: WorkerNotification, action: string): Promise<void> {
  notification.close();
  const data = readNotificationData(notification.data);
  const clients = await env.windowClients();

  if (data.kind === 'call' && action === NOTIFICATION_ACTION_DECLINE) {
    if (data.callId) {
      const callId = data.callId;
      clients.forEach((client) => client.postMessage({ type: 'sparkchat:call-decline', callId }));
      if (data.declineToken && env.declineCall) {
        await env.declineCall(callId, data.declineToken).catch(() => undefined);
      }
    }
    return;
  }

  const callId = data.kind === 'call' && action === NOTIFICATION_ACTION_ANSWER ? data.callId : undefined;
  const client = pickClient(clients);
  if (client) {
    await client.focus().catch(() => undefined);
    if (data.roomId) {
      client.postMessage({ type: 'sparkchat:open-room', roomId: data.roomId, ...(callId ? { callId } : {}) });
    }
    return;
  }
  await env.openWindow(buildLaunchUrl(env.scope, { roomId: data.roomId, callId }));
}

export async function handleClientMessage(env: WorkerEnvironment, state: WorkerState, clientId: string | null, raw: unknown): Promise<void> {
  if (!isClientToWorkerMessage(raw)) {
    return;
  }
  if (raw.type === 'sparkchat:locale') {
    await env.saveLanguage(raw.language);
    return;
  }
  if (!clientId) {
    return;
  }
  if (raw.roomId === null) {
    state.activeRooms.delete(clientId);
  } else {
    state.activeRooms.set(clientId, raw.roomId);
  }
}

export async function handleNavigation(fetchPage: () => Promise<Response>, offlinePage: () => Promise<Response | undefined>): Promise<Response> {
  try {
    return await fetchPage();
  } catch (error) {
    const fallback = await offlinePage().catch(() => undefined);
    if (fallback) {
      return fallback;
    }
    throw error;
  }
}
