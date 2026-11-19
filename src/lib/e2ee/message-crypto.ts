import { translate } from '@lib/i18n/app-i18n';
import { THUMBNAIL_MIME_TYPE } from '@lib/media/image-compression';
import { isStorageMediaUrl } from '@lib/media/media-origin';
import { resolveSafeMediaType } from '@lib/media/media-type';
import type {
  AppSocket,
  MessageFileMeta,
  MessageLinkPreview,
  MessageReplySnapshot,
  MessageType,
  MessageView,
  RoomSummary,
} from '@lib/socket';
import { decryptAttachment } from './attachment-crypto';
import { resolveDecryptedMediaUrl } from './media-cache';
import { E2E_V2_PREFIX, isAuthenticatedField, openAuthenticatedField, sealAuthenticatedField } from './authenticated-field';
import { getCurrentIdentity } from './current-identity';
import { ensureRoomKeyForDecryption, lookupContactKey, refetchRoomKeyAfterDecryptionFailure, requireCachedRoomKey } from './room-keys';
import { deriveSigningKeyPair } from './signing';
import { getSodium } from './sodium';

const E2E_PREFIX = 'e2e:v1:';

interface FieldSource {
  messageId: string;
  senderId: string;
}

const FIELD_LABELS = {
  content: 'content',
  caption: 'caption',
  fileName: 'file-name',
  fileMime: 'file-mime',
  linkUrl: 'link-url',
  linkTitle: 'link-title',
  linkDescription: 'link-description',
  linkImage: 'link-image',
  linkSite: 'link-site',
} as const;

const ENCRYPTED_MEDIA_PARAM = 'e2e';

const LINK_PREVIEW_IMAGE_META: MessageFileMeta = { name: 'link-preview', mimeType: THUMBNAIL_MIME_TYPE, size: 0 };

async function decryptText(payload: string, roomKey: Uint8Array): Promise<string> {
  const sodium = await getSodium();
  const combined = sodium.from_base64(payload.slice(E2E_PREFIX.length));
  const nonce = combined.subarray(0, sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = combined.subarray(sodium.crypto_secretbox_NONCEBYTES);
  const plaintextBytes = sodium.crypto_secretbox_open_easy(ciphertext, nonce, roomKey);
  return sodium.to_string(plaintextBytes);
}

async function resolveSenderSigningKey(socket: AppSocket, senderId: string): Promise<Uint8Array | null> {
  const sodium = await getSodium();
  const identity = getCurrentIdentity();
  if (identity && identity.userId === senderId) {
    return (await deriveSigningKeyPair(identity.privateKey)).publicKey;
  }
  const trust = await lookupContactKey(socket, senderId);
  const signingPublicKey = trust?.pin?.signingPublicKey;
  return signingPublicKey ? sodium.from_base64(signingPublicKey) : null;
}

async function openField(
  socket: AppSocket,
  content: string,
  roomId: string,
  roomKey: Uint8Array,
  source: FieldSource,
  label: string,
): Promise<string> {
  const signingKey = await resolveSenderSigningKey(socket, source.senderId);
  if (!signingKey) {
    throw new Error('Sender signing key unavailable');
  }
  return openAuthenticatedField(content, roomKey, signingKey, { roomId, senderId: source.senderId, messageId: source.messageId, label });
}

async function decryptTextContentIfNeeded(
  socket: AppSocket,
  content: string,
  roomId: string,
  source: FieldSource,
  label: string,
): Promise<string> {
  const authenticated = isAuthenticatedField(content);
  if (!authenticated && !content.startsWith(E2E_PREFIX)) {
    return content;
  }

  const roomKey = await ensureRoomKeyForDecryption(socket, roomId);
  if (!roomKey) {
    return translate('chat.message.encryptedUnavailable');
  }

  const open = (key: Uint8Array) =>
    authenticated ? openField(socket, content, roomId, key, source, label) : decryptText(content, key);

  const decrypted = await open(roomKey).catch(() => null);
  if (decrypted !== null) {
    return decrypted;
  }

  const refetched = await refetchRoomKeyAfterDecryptionFailure(socket, roomId);
  if (!refetched) {
    return translate('chat.message.encryptedUnavailable');
  }

  try {
    return await open(refetched);
  } catch {
    return translate('chat.message.encryptedUnavailable');
  }
}

export function isEncryptedMediaUrl(content: string): boolean {
  try {
    return new URL(content).searchParams.get(ENCRYPTED_MEDIA_PARAM) === '1';
  } catch {
    return false;
  }
}

export async function decryptMediaContentIfNeeded(
  socket: AppSocket,
  content: string,
  roomId: string,
  fileMeta: MessageFileMeta | null,
  messageType: MessageType,
): Promise<string> {
  if (!isEncryptedMediaUrl(content) || !isStorageMediaUrl(content)) {
    return content;
  }

  const roomKey = await ensureRoomKeyForDecryption(socket, roomId);
  if (!roomKey) {
    return content;
  }

  const mimeType = resolveSafeMediaType(messageType, fileMeta?.mimeType);
  return resolveDecryptedMediaUrl(content, mimeType, async () => {
    try {
      const response = await fetch(content, { credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) {
        return null;
      }
      const ciphertext = await response.arrayBuffer();
      const blob = await decryptAttachment(roomId, ciphertext, mimeType);
      return blob ? URL.createObjectURL(blob) : null;
    } catch {
      return null;
    }
  });
}

async function resolveContent(
  socket: AppSocket,
  content: string,
  roomId: string,
  type: MessageType,
  fileMeta: MessageFileMeta | null,
  source: FieldSource,
): Promise<string> {
  return type === 'text'
    ? decryptTextContentIfNeeded(socket, content, roomId, source, FIELD_LABELS.content)
    : decryptMediaContentIfNeeded(socket, content, roomId, fileMeta, type);
}

async function decryptCaptionIfNeeded(
  socket: AppSocket,
  caption: string | null | undefined,
  roomId: string,
  source: FieldSource,
): Promise<string | null> {
  if (!caption) {
    return null;
  }
  return decryptTextContentIfNeeded(socket, caption, roomId, source, FIELD_LABELS.caption);
}

async function decryptFileMetaIfNeeded(
  socket: AppSocket,
  fileMeta: MessageFileMeta | null | undefined,
  roomId: string,
  source: FieldSource,
): Promise<MessageFileMeta | null> {
  if (!fileMeta) {
    return null;
  }
  const [name, mimeType] = await Promise.all([
    decryptTextContentIfNeeded(socket, fileMeta.name, roomId, source, FIELD_LABELS.fileName),
    decryptTextContentIfNeeded(socket, fileMeta.mimeType, roomId, source, FIELD_LABELS.fileMime),
  ]);
  const decrypted = { ...fileMeta, name, mimeType };
  const thumbnailUrl = fileMeta.thumbnailUrl
    ? await decryptMediaContentIfNeeded(socket, fileMeta.thumbnailUrl, roomId, { ...decrypted, mimeType: THUMBNAIL_MIME_TYPE }, 'image')
    : undefined;
  return { ...decrypted, ...(thumbnailUrl !== undefined ? { thumbnailUrl } : {}) };
}

async function decryptNullableTextIfNeeded(
  socket: AppSocket,
  value: string | null,
  roomId: string,
  source: FieldSource,
  label: string,
): Promise<string | null> {
  if (!value) {
    return null;
  }
  return decryptTextContentIfNeeded(socket, value, roomId, source, label);
}

async function decryptLinkPreviewIfNeeded(
  socket: AppSocket,
  linkPreview: MessageLinkPreview | null | undefined,
  roomId: string,
  source: FieldSource,
): Promise<MessageLinkPreview | null> {
  if (!linkPreview) {
    return null;
  }

  const [url, title, description, imageUrl, siteName] = await Promise.all([
    decryptTextContentIfNeeded(socket, linkPreview.url, roomId, source, FIELD_LABELS.linkUrl),
    decryptTextContentIfNeeded(socket, linkPreview.title, roomId, source, FIELD_LABELS.linkTitle),
    decryptNullableTextIfNeeded(socket, linkPreview.description, roomId, source, FIELD_LABELS.linkDescription),
    decryptNullableTextIfNeeded(socket, linkPreview.imageUrl, roomId, source, FIELD_LABELS.linkImage),
    decryptNullableTextIfNeeded(socket, linkPreview.siteName, roomId, source, FIELD_LABELS.linkSite),
  ]);

  return { url, title, description, imageUrl: await resolveLinkPreviewImage(socket, imageUrl, roomId), siteName };
}

async function resolveLinkPreviewImage(socket: AppSocket, imageUrl: string | null, roomId: string): Promise<string | null> {
  if (!imageUrl || !isEncryptedMediaUrl(imageUrl)) {
    return null;
  }

  const resolved = await decryptMediaContentIfNeeded(socket, imageUrl, roomId, LINK_PREVIEW_IMAGE_META, 'image');
  return resolved.startsWith('blob:') ? resolved : null;
}

async function decryptReplySnapshot(
  socket: AppSocket,
  reply: MessageReplySnapshot | null,
  roomId: string,
): Promise<MessageReplySnapshot | null> {
  if (!reply || reply.deleted) {
    return reply;
  }
  const source = { messageId: reply.id, senderId: reply.sender.id };
  const fileMeta = await decryptFileMetaIfNeeded(socket, reply.fileMeta, roomId, source);
  const [content, caption] = await Promise.all([
    resolveContent(socket, reply.content, roomId, reply.type, fileMeta, source),
    decryptCaptionIfNeeded(socket, reply.caption, roomId, source),
  ]);
  return { ...reply, content, caption, fileMeta };
}

const UNENCRYPTED_EXEMPT_TYPES: ReadonlySet<MessageType> = new Set(['system', 'error']);

function isPlaintextField(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.length > 0 && !value.startsWith(E2E_PREFIX) && !value.startsWith(E2E_V2_PREFIX);
}

function isPlaintextMediaUrl(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.length > 0 && !isEncryptedMediaUrl(value);
}

export function hasUnencryptedFields(message: MessageView): boolean {
  if (UNENCRYPTED_EXEMPT_TYPES.has(message.type) || message.deletedForEveryone) {
    return false;
  }

  const { fileMeta, linkPreview } = message;
  const contentIsPlain = message.type === 'text' ? isPlaintextField(message.content) : isPlaintextMediaUrl(message.content);
  const fileMetaIsPlain = fileMeta
    ? isPlaintextField(fileMeta.name) || isPlaintextField(fileMeta.mimeType) || isPlaintextMediaUrl(fileMeta.thumbnailUrl)
    : false;
  const linkPreviewIsPlain = linkPreview
    ? [linkPreview.url, linkPreview.title, linkPreview.description, linkPreview.imageUrl, linkPreview.siteName].some(isPlaintextField)
    : false;

  return contentIsPlain || isPlaintextField(message.caption) || fileMetaIsPlain || linkPreviewIsPlain;
}

export async function decryptMessageView(socket: AppSocket, message: MessageView): Promise<MessageView> {
  const unencrypted = hasUnencryptedFields(message);
  const source = { messageId: message.id, senderId: message.sender.id };
  const fileMeta = await decryptFileMetaIfNeeded(socket, message.fileMeta, message.roomId, source);
  const deferOriginal = message.type === 'image' && Boolean(fileMeta?.thumbnailUrl);
  const [content, replyTo, caption, linkPreview] = await Promise.all([
    deferOriginal ? Promise.resolve(message.content) : resolveContent(socket, message.content, message.roomId, message.type, fileMeta, source),
    decryptReplySnapshot(socket, message.replyTo, message.roomId),
    decryptCaptionIfNeeded(socket, message.caption, message.roomId, source),
    decryptLinkPreviewIfNeeded(socket, message.linkPreview, message.roomId, source),
  ]);
  return { ...message, content, replyTo, caption, fileMeta, linkPreview, unencrypted };
}

export function decryptMessageViews(socket: AppSocket, messages: MessageView[]): Promise<MessageView[]> {
  return Promise.all(messages.map((message) => decryptMessageView(socket, message)));
}

export async function decryptRoomSummary(socket: AppSocket, room: RoomSummary): Promise<RoomSummary> {
  if (!room.lastMessage) {
    return room;
  }
  return { ...room, lastMessage: await decryptMessageView(socket, room.lastMessage) };
}

export function decryptRoomSummaries(socket: AppSocket, rooms: RoomSummary[]): Promise<RoomSummary[]> {
  return Promise.all(rooms.map((room) => decryptRoomSummary(socket, room)));
}

export interface OutgoingMessageFields {
  roomId: string;
  type?: string;
  content: string;
  caption?: string;
  fileMeta?: MessageFileMeta;
  linkPreview?: MessageLinkPreview;
  messageId?: string;
}

export async function encryptOutgoingMessage<T extends OutgoingMessageFields>(message: T): Promise<T & { messageId: string }> {
  const roomKey = requireCachedRoomKey(message.roomId);
  const identity = getCurrentIdentity();
  if (!identity) {
    throw new Error('Cannot encrypt a message without an identity');
  }
  const signingKeys = await deriveSigningKeyPair(identity.privateKey);
  const messageId = crypto.randomUUID();
  const seal = (value: string, label: string) =>
    sealAuthenticatedField(value, roomKey, signingKeys.privateKey, {
      roomId: message.roomId,
      senderId: identity.userId,
      messageId,
      label,
    });
  const sealNullable = (value: string | null, label: string) => (value ? seal(value, label) : Promise.resolve(null));

  try {
    const contentPromise =
      (message.type ?? 'text') === 'text' ? seal(message.content, FIELD_LABELS.content) : Promise.resolve(message.content);
    const captionPromise = message.caption ? seal(message.caption, FIELD_LABELS.caption) : Promise.resolve(undefined);
    const fileMetaPromise = message.fileMeta
      ? Promise.all([seal(message.fileMeta.name, FIELD_LABELS.fileName), seal(message.fileMeta.mimeType, FIELD_LABELS.fileMime)]).then(
          ([name, mimeType]) => ({ ...message.fileMeta, name, mimeType }),
        )
      : Promise.resolve(undefined);
    const linkPreviewPromise = message.linkPreview
      ? Promise.all([
          seal(message.linkPreview.url, FIELD_LABELS.linkUrl),
          seal(message.linkPreview.title, FIELD_LABELS.linkTitle),
          sealNullable(message.linkPreview.description, FIELD_LABELS.linkDescription),
          sealNullable(message.linkPreview.imageUrl, FIELD_LABELS.linkImage),
          sealNullable(message.linkPreview.siteName, FIELD_LABELS.linkSite),
        ]).then(([url, title, description, imageUrl, siteName]) => ({ url, title, description, imageUrl, siteName }))
      : Promise.resolve(undefined);

    const [content, caption, fileMeta, linkPreview] = await Promise.all([
      contentPromise,
      captionPromise,
      fileMetaPromise,
      linkPreviewPromise,
    ]);

    return {
      ...message,
      messageId,
      content,
      ...(caption !== undefined ? { caption } : {}),
      ...(fileMeta !== undefined ? { fileMeta } : {}),
      ...(linkPreview !== undefined ? { linkPreview } : {}),
    };
  } finally {
    signingKeys.privateKey.fill(0);
  }
}
