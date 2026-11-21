import { translate } from '@lib/i18n/app-i18n';
import { THUMBNAIL_MIME_TYPE } from '@lib/media/image-compression';
import { isStorageMediaUrl } from '@lib/media/media-origin';
import { unpadGif } from '@lib/media/gif-padding';
import { isGifMimeType, resolveSafeMediaType } from '@lib/media/media-type';
import type {
  AppSocket,
  MessageFileMeta,
  MessageLinkPreview,
  MessageReplySnapshot,
  MessageType,
  MessageView,
  RoomSummary,
} from '@lib/socket';
import { openAttachment, type AttachmentBinding } from './attachment-crypto';
import { markExpiredMediaUrl, resolveDecryptedMediaUrl } from './media-cache';
import { openAuthenticatedField, parseAuthenticatedField, sealAuthenticatedField } from './authenticated-field';
import { getCurrentIdentity } from './current-identity';
import { assessSystemEvent, assessSystemEvents, checkGroupSender, getAttestedNames } from './group-event-trust';
import { openReactions } from './reaction-crypto';
import { ensureRoomKeyGeneration, requireCurrentRoomKey, resolveRoomName } from './room-keys';
import { resolveSenderSigningKey } from './sender-signing-key';
import { deriveSigningKeyPair } from './signing';

const ENCRYPTED_FIELD_PREFIX = 'e2e:';

interface FieldSource {
  messageId: string;
  senderId: string;
  timestamp?: string;
  live?: boolean;
  checkSender?: boolean;
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
  fileKey: 'file-key',
  thumbnailKey: 'thumbnail-key',
  previewKey: 'preview-key',
} as const;

const ENCRYPTED_MEDIA_PARAM = 'e2e';

const ATTACHMENT_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    if (source.checkSender !== false && (await checkGroupSender(roomId, parsed.keyId, source)) !== 'ok') {
      return translate('chat.message.fromRemovedMember');
    }
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

export interface EncryptedMediaSource {
  roomId: string;
  messageId: string;
  fileMeta: MessageFileMeta | null;
  messageType: MessageType;
}

const EXPIRED_MEDIA_STATUSES: ReadonlySet<number> = new Set([403, 404]);

async function openPaddedGif(ciphertext: ArrayBuffer, key: string, binding: AttachmentBinding, mimeType: string): Promise<Blob | null> {
  const padded = await openAttachment(ciphertext, key, binding, mimeType);
  return padded ? unpadGif(new Uint8Array(await padded.arrayBuffer()), mimeType) : null;
}

function decryptAttachmentUrl(
  content: string,
  binding: AttachmentBinding,
  key: string | undefined,
  mimeType: string,
  isGif = false,
): Promise<string> {
  if (!key || !isEncryptedMediaUrl(content) || !isStorageMediaUrl(content)) {
    return Promise.resolve(content);
  }

  const scope = [mimeType, binding.roomId, binding.messageId, binding.slot, isGif ? 'gif' : 'media'].join('\n');
  return resolveDecryptedMediaUrl(content, scope, async () => {
    try {
      const response = await fetch(content, { credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) {
        if (isGif && EXPIRED_MEDIA_STATUSES.has(response.status)) {
          markExpiredMediaUrl(content);
        }
        return null;
      }
      const ciphertext = await response.arrayBuffer();
      const blob = isGif ? await openPaddedGif(ciphertext, key, binding, mimeType) : await openAttachment(ciphertext, key, binding, mimeType);
      return blob ? URL.createObjectURL(blob) : null;
    } catch {
      return null;
    }
  });
}

export function decryptMediaContentIfNeeded(content: string, source: EncryptedMediaSource): Promise<string> {
  const mimeType = resolveSafeMediaType(source.messageType, source.fileMeta?.mimeType);
  const isGif = source.messageType === 'image' && isGifMimeType(source.fileMeta?.mimeType);
  return decryptAttachmentUrl(
    content,
    { roomId: source.roomId, messageId: source.messageId, slot: 'content' },
    source.fileMeta?.key,
    mimeType,
    isGif,
  );
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
    : decryptMediaContentIfNeeded(content, { roomId, messageId: source.messageId, fileMeta, messageType: type });
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
  const [name, mimeType, key, thumbnailKey, previewKey] = await Promise.all([
    decryptTextContentIfNeeded(socket, fileMeta.name, roomId, source, FIELD_LABELS.fileName),
    decryptTextContentIfNeeded(socket, fileMeta.mimeType, roomId, source, FIELD_LABELS.fileMime),
    decryptAttachmentKey(socket, fileMeta.key, roomId, source, FIELD_LABELS.fileKey),
    decryptAttachmentKey(socket, fileMeta.thumbnailKey, roomId, source, FIELD_LABELS.thumbnailKey),
    decryptAttachmentKey(socket, fileMeta.previewKey, roomId, source, FIELD_LABELS.previewKey),
  ]);
  const decrypted: MessageFileMeta = {
    name,
    mimeType,
    size: fileMeta.size,
    ...(key ? { key } : {}),
    ...(thumbnailKey ? { thumbnailKey } : {}),
    ...(previewKey ? { previewKey } : {}),
  };
  const thumbnailUrl = fileMeta.thumbnailUrl
    ? await decryptAttachmentUrl(
        fileMeta.thumbnailUrl,
        { roomId, messageId: source.messageId, slot: 'thumbnail' },
        thumbnailKey ?? undefined,
        THUMBNAIL_MIME_TYPE,
      )
    : undefined;
  return { ...decrypted, ...(thumbnailUrl !== undefined ? { thumbnailUrl } : {}) };
}

async function decryptAttachmentKey(
  socket: AppSocket,
  value: string | undefined,
  roomId: string,
  source: FieldSource,
  label: string,
): Promise<string | null> {
  if (!value?.startsWith(ENCRYPTED_FIELD_PREFIX)) {
    return null;
  }
  const decrypted = await decryptTextContentIfNeeded(socket, value, roomId, source, label);
  return ATTACHMENT_KEY_PATTERN.test(decrypted) ? decrypted : null;
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
  previewKey: string | undefined,
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

  const image = await resolveLinkPreviewImage(imageUrl, { roomId, messageId: source.messageId, slot: 'preview' }, previewKey);
  return { url, title, description, imageUrl: image, siteName };
}

async function resolveLinkPreviewImage(imageUrl: string | null, binding: AttachmentBinding, previewKey: string | undefined): Promise<string | null> {
  if (!imageUrl || !isEncryptedMediaUrl(imageUrl)) {
    return null;
  }

  const resolved = await decryptAttachmentUrl(imageUrl, binding, previewKey, THUMBNAIL_MIME_TYPE);
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
  const source = { messageId: reply.id, senderId: reply.sender.id, checkSender: false };
  const fileMeta = await decryptFileMetaIfNeeded(socket, reply.fileMeta, roomId, source);
  const [content, caption] = await Promise.all([
    isGifImage(reply.type, fileMeta) ? Promise.resolve(reply.content) : resolveContent(socket, reply.content, roomId, reply.type, fileMeta, source),
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
    ? [fileMeta.name, fileMeta.mimeType, fileMeta.key, fileMeta.thumbnailKey, fileMeta.previewKey].some(isPlaintextField) ||
      isPlaintextMediaUrl(fileMeta.thumbnailUrl)
    : false;
  const linkPreviewIsPlain = linkPreview
    ? [linkPreview.url, linkPreview.title, linkPreview.description, linkPreview.imageUrl, linkPreview.siteName].some(isPlaintextField)
    : false;

  return contentIsPlain || isPlaintextField(message.caption) || fileMetaIsPlain || linkPreviewIsPlain;
}

export interface DecryptMessageViewOptions {
  deferGifMedia?: boolean;
  live?: boolean;
  skipReactions?: boolean;
}

function isGifImage(type: MessageType, fileMeta: MessageFileMeta | null): boolean {
  return type === 'image' && isGifMimeType(fileMeta?.mimeType);
}

export async function decryptMessageView(socket: AppSocket, message: MessageView, options: DecryptMessageViewOptions = {}): Promise<MessageView> {
  const unencrypted = hasUnencryptedFields(message);
  const source = { messageId: message.id, senderId: message.sender.id, timestamp: message.timestamp, live: options.live === true };
  const eventTrust = await assessSystemEvent(socket, message);
  const names = eventTrust === 'verified' ? getAttestedNames(message.id) : undefined;
  const systemEvent =
    names && message.systemEvent ? { ...message.systemEvent, params: { ...message.systemEvent.params, ...names } } : message.systemEvent;
  if (eventTrust === 'forged') {
    return message.systemEvent?.type === 'group.memberJoined'
      ? { ...message, eventTrust, unencrypted }
      : { ...message, systemEvent: null, content: translate('systemEvents.forgedEvent'), eventTrust, unencrypted };
  }
  const fileMeta = await decryptFileMetaIfNeeded(socket, message.fileMeta, message.roomId, source);
  const deferOriginal =
    message.type === 'image' && (Boolean(fileMeta?.thumbnailUrl) || (options.deferGifMedia === true && isGifImage(message.type, fileMeta)));
  const [content, replyTo, caption, linkPreview, reactions] = await Promise.all([
    deferOriginal ? Promise.resolve(message.content) : resolveContent(socket, message.content, message.roomId, message.type, fileMeta, source),
    decryptReplySnapshot(socket, message.replyTo, message.roomId),
    decryptCaptionIfNeeded(socket, message.caption, message.roomId, source),
    decryptLinkPreviewIfNeeded(socket, message.linkPreview, message.roomId, source, fileMeta?.previewKey),
    options.skipReactions === true || message.deletedForEveryone
      ? Promise.resolve([])
      : openReactions(socket, message.roomId, message.id, message.reactions, { messageTimestamp: message.timestamp }),
  ]);
  return {
    ...message,
    content,
    replyTo,
    caption,
    fileMeta,
    linkPreview,
    reactions,
    unencrypted,
    ...(systemEvent ? { systemEvent } : {}),
    ...(eventTrust ? { eventTrust } : {}),
  };
}

export async function decryptMessageViews(socket: AppSocket, messages: MessageView[]): Promise<MessageView[]> {
  await assessSystemEvents(socket, messages);
  return Promise.all(messages.map((message) => decryptMessageView(socket, message)));
}

async function withDecryptedName(socket: AppSocket, room: RoomSummary): Promise<RoomSummary> {
  if (room.type !== 'group') {
    return room;
  }
  const { name: _serverName, ...rest } = room;
  const name = await resolveRoomName(socket, room);
  return name ? { ...rest, name } : rest;
}

export async function decryptRoomSummary(socket: AppSocket, room: RoomSummary): Promise<RoomSummary> {
  const [named, lastMessage] = await Promise.all([
    withDecryptedName(socket, room),
    room.lastMessage ? decryptMessageView(socket, room.lastMessage, { deferGifMedia: true, skipReactions: true }) : Promise.resolve(null),
  ]);
  return { ...named, lastMessage };
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

type SealField = (value: string, label: string) => Promise<string>;

async function sealFileMeta(fileMeta: MessageFileMeta, seal: SealField): Promise<MessageFileMeta> {
  const sealOptional = (value: string | undefined, label: string) => (value ? seal(value, label) : Promise.resolve(undefined));
  const [name, mimeType, key, thumbnailKey, previewKey] = await Promise.all([
    seal(fileMeta.name, FIELD_LABELS.fileName),
    seal(fileMeta.mimeType, FIELD_LABELS.fileMime),
    sealOptional(fileMeta.key, FIELD_LABELS.fileKey),
    sealOptional(fileMeta.thumbnailKey, FIELD_LABELS.thumbnailKey),
    sealOptional(fileMeta.previewKey, FIELD_LABELS.previewKey),
  ]);
  return {
    name,
    mimeType,
    size: fileMeta.size,
    ...(fileMeta.thumbnailUrl ? { thumbnailUrl: fileMeta.thumbnailUrl } : {}),
    ...(key ? { key } : {}),
    ...(thumbnailKey ? { thumbnailKey } : {}),
    ...(previewKey ? { previewKey } : {}),
  };
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
  const messageId = message.messageId ?? crypto.randomUUID();
  if (!UUID_PATTERN.test(messageId)) {
    throw new Error('Outgoing message id must be a UUID');
  }
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
    const fileMetaPromise = message.fileMeta ? sealFileMeta(message.fileMeta, seal) : Promise.resolve(undefined);
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
