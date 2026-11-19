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
import { decryptAttachment, readAttachmentKeyId } from './attachment-crypto';
import { resolveDecryptedMediaUrl } from './media-cache';
import { openAuthenticatedField, parseAuthenticatedField, sealAuthenticatedField } from './authenticated-field';
import { getCurrentIdentity } from './current-identity';
import { ensureAnyRoomKey, ensureRoomKeyGeneration, lookupContactKey, requireCurrentRoomKey } from './room-keys';
import { deriveSigningKeyPair } from './signing';
import { getSodium } from './sodium';

const ENCRYPTED_FIELD_PREFIX = 'e2e:';

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

const ownSigningPublicKeys = new WeakMap<Uint8Array, Uint8Array>();

async function resolveOwnSigningPublicKey(privateKey: Uint8Array): Promise<Uint8Array> {
  const cached = ownSigningPublicKeys.get(privateKey);
  if (cached) {
    return cached;
  }
  const pair = await deriveSigningKeyPair(privateKey);
  pair.privateKey.fill(0);
  ownSigningPublicKeys.set(privateKey, pair.publicKey);
  return pair.publicKey;
}

async function resolveSenderSigningKey(socket: AppSocket, senderId: string): Promise<Uint8Array | null> {
  const sodium = await getSodium();
  const identity = getCurrentIdentity();
  if (identity && identity.userId === senderId) {
    return resolveOwnSigningPublicKey(identity.privateKey);
  }
  const trust = await lookupContactKey(socket, senderId);
  const signingPublicKey = trust?.pin?.signingPublicKey;
  return signingPublicKey ? sodium.from_base64(signingPublicKey) : null;
}

async function decryptTextContentIfNeeded(
  socket: AppSocket,
  content: string,
  roomId: string,
  source: FieldSource,
  label: string,
): Promise<string> {
  if (!content.startsWith(ENCRYPTED_FIELD_PREFIX)) {
    return content;
  }
  const parsed = parseAuthenticatedField(content);
  if (!parsed) {
    return translate('chat.message.unsupportedFormat');
  }

  const roomKey = await ensureRoomKeyGeneration(socket, roomId, parsed.keyId);
  if (!roomKey) {
    return translate('chat.message.encryptedUnavailable');
  }

  try {
    const signingKey = await resolveSenderSigningKey(socket, source.senderId);
    if (!signingKey) {
      return translate('chat.message.encryptedUnavailable');
    }
    return await openAuthenticatedField(content, roomKey, signingKey, {
      roomId,
      senderId: source.senderId,
      messageId: source.messageId,
      keyId: parsed.keyId,
      label,
    });
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

  if (!(await ensureAnyRoomKey(socket, roomId))) {
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
      const keyId = await readAttachmentKeyId(ciphertext);
      const roomKey = keyId ? await ensureRoomKeyGeneration(socket, roomId, keyId) : null;
      if (!roomKey) {
        return null;
      }
      const blob = await decryptAttachment(ciphertext, roomKey, mimeType);
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
  return typeof value === 'string' && value.length > 0 && !value.startsWith(ENCRYPTED_FIELD_PREFIX);
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
  if ((message.type ?? 'text') !== 'text' && !message.fileMeta) {
    throw new Error('Attachment messages need file details');
  }
  const generation = requireCurrentRoomKey(message.roomId);
  const identity = getCurrentIdentity();
  if (!identity) {
    throw new Error('Cannot encrypt a message without an identity');
  }
  const signingKeys = await deriveSigningKeyPair(identity.privateKey);
  const messageId = crypto.randomUUID();
  const seal = (value: string, label: string) =>
    sealAuthenticatedField(value, generation.key, signingKeys.privateKey, {
      roomId: message.roomId,
      senderId: identity.userId,
      messageId,
      keyId: generation.keyId,
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
