import type { NotificationMirror } from '../lib/notification-mirror';
import type { WorkerStrings } from './sw-strings';

export type PreviewKind = 'text' | 'image' | 'audio' | 'file';

export interface PushMessagePreview {
  id: string;
  senderId: string;
  kind: PreviewKind;
  content?: string;
}

export interface FieldContext {
  roomId: string;
  senderId: string;
  messageId: string;
  keyId: string;
  label: string;
}

export interface PreviewDeps {
  readMirror: () => Promise<NotificationMirror | null>;
  loadRoomKey: (roomId: string, keyId: string) => Promise<Uint8Array | null>;
  loadSigningKey: (ownerId: string, senderId: string) => Promise<Uint8Array | null>;
  openField: (payload: string, roomKey: Uint8Array, signingKey: Uint8Array, context: FieldContext) => Promise<string>;
}

export interface NotificationText {
  title: string;
  body: string;
}

const FIELD_PATTERN = /^e2e:v2:([A-Za-z0-9_-]{22}):/;
const MAX_BODY_LENGTH = 180;

function collapse(text: string): string {
  const single = text.replace(/\s+/g, ' ').trim();
  return single.length > MAX_BODY_LENGTH ? `${single.slice(0, MAX_BODY_LENGTH - 1)}…` : single;
}

async function decryptText(roomId: string, message: PushMessagePreview, ownerId: string, deps: PreviewDeps): Promise<string | null> {
  const content = message.content;
  const keyId = content ? FIELD_PATTERN.exec(content)?.[1] : undefined;
  if (!content || !keyId) {
    return null;
  }
  const [roomKey, signingKey] = await Promise.all([deps.loadRoomKey(roomId, keyId), deps.loadSigningKey(ownerId, message.senderId)]);
  if (!roomKey || !signingKey) {
    return null;
  }
  try {
    const text = collapse(await deps.openField(content, roomKey, signingKey, { roomId, senderId: message.senderId, messageId: message.id, keyId, label: 'content' }));
    return text || null;
  } catch {
    return null;
  } finally {
    roomKey.fill(0);
  }
}

async function describe(roomId: string, message: PushMessagePreview, ownerId: string, strings: WorkerStrings, deps: PreviewDeps): Promise<string | null> {
  switch (message.kind) {
    case 'image':
      return strings.photo;
    case 'audio':
      return strings.audio;
    case 'file':
      return strings.file;
    default:
      return decryptText(roomId, message, ownerId, deps);
  }
}

export async function resolveMessagePreview(
  roomId: string,
  message: PushMessagePreview | undefined,
  strings: WorkerStrings,
  deps: PreviewDeps,
): Promise<NotificationText | null> {
  if (!message) {
    return null;
  }
  const mirror = await deps.readMirror().catch(() => null);
  if (!mirror || mirror.hideContent || message.senderId === mirror.ownerId) {
    return null;
  }
  const text = await describe(roomId, message, mirror.ownerId, strings, deps).catch(() => null);
  if (!text) {
    return null;
  }
  const sender = mirror.names.users[message.senderId];
  const group = mirror.names.groups[roomId];
  if (group) {
    return { title: group, body: sender ? `${sender}: ${text}` : text };
  }
  return { title: sender ?? strings.newMessage, body: text };
}
