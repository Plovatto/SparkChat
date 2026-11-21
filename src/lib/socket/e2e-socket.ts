import {
  applyRoomParticipants,
  applyRoomSummaries,
  applyRoomSummary,
  applySelfUser,
  attachProfilePhotoSocket,
  decryptMessageView,
  decryptMessageViews,
  decryptRoomSummaries,
  decryptRoomSummary,
  encryptOutgoingMessage,
  ensureRoomKeyForSending,
  ensureSigningKeyPublished,
  forgetRoom,
  getCurrentIdentity,
  handleBlockStatus,
  handleGroupUserJoined,
  handleKeyRequest,
  handleProfileKeysUpdated,
  handleRoomAvatarUpdated,
  handleRoomKeyPush,
  handleRoomInviteResetRejected,
  handleRoomInviteUpdated,
  handleRoomKeyRejected,
  handleRoomNameUpdated,
  handleRotationRequired,
  handleUserAvatarUpdated,
  MissingRoomKeyError,
  openReactions,
  recoverFromStaleRoomKey,
  sealReaction,
  subscribeCurrentIdentity,
  trackRoom,
  updateRoomParticipants,
} from '@lib/e2ee';
import { translate } from '@lib/i18n/app-i18n';
import { attachKeyTransparency } from '@lib/kt/kt-manager';
import type { AppSocket } from './socket-client';
import type {
  BlockStatusPayload,
  ClientToServerEvents,
  MessageReactionsUpdatedPayload,
  MessageView,
  RoomParticipant,
  RoomSummary,
  SealedRoomKeyEntry,
  ServerToClientEvents,
  SocketErrorPayload,
  SocketUser,
} from './socket-events';

type AnyHandler = (...args: never[]) => void;
type GenericOn = (event: string, handler: AnyHandler) => AppSocket;
type GenericOff = (event?: string, handler?: AnyHandler) => AppSocket;
type GenericEmit = (event: string, ...args: unknown[]) => AppSocket;

type OutgoingMessage = Parameters<ClientToServerEvents['message:send']>[0];

type OutgoingReaction = Parameters<ClientToServerEvents['message:react']>[0];

type RoomKeyRejectedPayload = Parameters<ServerToClientEvents['e2e:room-key-rejected']>[0];

const STALE_ROOM_KEY_CODE = 'message.staleRoomKey';

interface PendingSend {
  payload: OutgoingMessage;
  keyId: string;
  retried: boolean;
}

interface PendingReaction {
  payload: OutgoingReaction;
  keyId: string;
  retried: boolean;
}

const REACT_EVENT = 'message:react';

function notifySendFailure(socket: AppSocket, clientTempId: string | undefined, error: unknown): void {
  const message = error instanceof MissingRoomKeyError ? error.message : translate('errors.e2ee.encryptFailed');
  for (const listener of socket.listeners('error')) {
    listener({ message, clientTempId });
  }
}

function notifyReactionFailure(socket: AppSocket, messageId: string, error: unknown): void {
  const message = error instanceof MissingRoomKeyError ? error.message : translate('errors.e2ee.encryptFailed');
  for (const listener of socket.listeners('error')) {
    listener({ message, event: REACT_EVENT, messageId });
  }
}

const DECRYPT_EVENTS = new Set([
  'message:new',
  'messages:list',
  'message:updated',
  'message:reactions-updated',
  'room:created',
  'room:joined',
  'room:new',
  'rooms:list',
]);

interface DeferredRoomEvent {
  room: RoomSummary;
  event: string;
  groupName?: string;
}

type DeferredRoomEvents = Map<string, DeferredRoomEvent>;

function deferRoomEvent(deferred: DeferredRoomEvents, room: RoomSummary, event: string, groupName: string | undefined): void {
  const previous = deferred.get(room.id);
  const keepsActiveCreation = previous?.event === 'room:joined' && event !== 'room:joined';
  const name = groupName ?? previous?.groupName;
  deferred.set(room.id, { room, event: keepsActiveCreation ? previous.event : event, ...(name ? { groupName: name } : {}) });
}

function maybeEstablishRoomKey(socket: AppSocket, room: RoomSummary, event: string, deferred: DeferredRoomEvents, groupName?: string): void {
  if (!getCurrentIdentity()) {
    deferRoomEvent(deferred, room, event, groupName);
    return;
  }
  void trackRoom(socket, room, { activeCreation: event === 'room:joined', ...(groupName ? { groupName } : {}) });
}

const previewOnlyHandlers = new WeakSet<object>();

export function markPreviewOnlyHandler<T extends object>(handler: T): T {
  previewOnlyHandlers.add(handler);
  return handler;
}

async function transformPayload(socket: AppSocket, event: string, payload: unknown, previewOnly = false): Promise<unknown> {
  switch (event) {
    case 'message:new':
    case 'message:updated':
      return decryptMessageView(socket, payload as MessageView, { deferGifMedia: previewOnly, live: event === 'message:new' });

    case 'message:reactions-updated': {
      const typed = payload as MessageReactionsUpdatedPayload;
      return { ...typed, reactions: await openReactions(socket, typed.roomId, typed.messageId, typed.reactions, { live: true }) };
    }

    case 'messages:list': {
      const typed = payload as { roomId: string; messages: MessageView[]; hasMore: boolean };
      return { ...typed, messages: await decryptMessageViews(socket, typed.messages) };
    }

    case 'room:created':
    case 'room:joined':
    case 'room:new': {
      const typed = payload as { room: RoomSummary; messages: MessageView[] };
      const [room, messages] = await Promise.all([
        decryptRoomSummary(socket, typed.room),
        decryptMessageViews(socket, typed.messages),
      ]);
      return { room, messages };
    }

    case 'rooms:list': {
      const typed = payload as { rooms: RoomSummary[] };
      return { rooms: await decryptRoomSummaries(socket, typed.rooms) };
    }

    default:
      return payload;
  }
}

export function wrapSocketWithE2e(socket: AppSocket): AppSocket {
  const wrappedHandlers = new Map<string, Map<AnyHandler, AnyHandler>>();

  function getBucket(event: string): Map<AnyHandler, AnyHandler> {
    let bucket = wrappedHandlers.get(event);
    if (!bucket) {
      bucket = new Map();
      wrappedHandlers.set(event, bucket);
    }
    return bucket;
  }

  const genericSocket = socket as unknown as {
    on: GenericOn;
    off: GenericOff;
    emit: GenericEmit;
  };

  const originalOn = genericSocket.on.bind(socket);
  const originalOff = genericSocket.off.bind(socket);
  const originalEmit = genericSocket.emit.bind(socket);

  let dispatchQueue: Promise<void> = Promise.resolve();

  const pendingSends = new Map<string, PendingSend>();
  let pendingGroupName: string | null = null;

  const takeCreatedGroupName = (room: RoomSummary): string | undefined => {
    const identity = getCurrentIdentity();
    if (room.type !== 'group' || (room.currentEpoch ?? 0) !== 0 || (identity && room.creatorId !== identity.userId)) {
      return undefined;
    }
    const name = pendingGroupName ?? undefined;
    pendingGroupName = null;
    return name;
  };
  const staleRetryDecisions = new WeakMap<object, boolean>();

  const sendEncrypted = (payload: OutgoingMessage, staleKeyId: string | null) => {
    const obtainKey = staleKeyId
      ? recoverFromStaleRoomKey(socket, payload.roomId, staleKeyId)
      : ensureRoomKeyForSending(socket, payload.roomId);
    void obtainKey
      .then(async (generation) => {
        const encrypted = await encryptOutgoingMessage(payload);
        if (payload.clientTempId) {
          pendingSends.set(payload.clientTempId, { payload, keyId: generation.keyId, retried: staleKeyId !== null });
        }
        originalEmit('message:send', encrypted);
      })
      .catch((error: unknown) => {
        console.error('[e2e] failed to encrypt outgoing message, not sending it', error);
        notifySendFailure(socket, payload.clientTempId, error);
      });
  };

  const pendingReactions = new Map<string, PendingReaction>();

  const sendReaction = (payload: OutgoingReaction, staleKeyId: string | null) => {
    if (payload.emoji === null) {
      pendingReactions.delete(payload.messageId);
      originalEmit(REACT_EVENT, { messageId: payload.messageId, emoji: null });
      return;
    }
    const emoji = payload.emoji;
    const obtainKey = staleKeyId
      ? recoverFromStaleRoomKey(socket, payload.roomId, staleKeyId)
      : ensureRoomKeyForSending(socket, payload.roomId);
    void obtainKey
      .then(async (generation) => {
        const sealed = await sealReaction({ roomId: payload.roomId, messageId: payload.messageId }, emoji);
        pendingReactions.set(payload.messageId, { payload, keyId: generation.keyId, retried: staleKeyId !== null });
        originalEmit(REACT_EVENT, { messageId: payload.messageId, emoji: sealed });
      })
      .catch((error: unknown) => {
        console.error('[e2e] failed to encrypt reaction, not sending it', error);
        notifyReactionFailure(socket, payload.messageId, error);
      });
  };

  const retriesStaleReaction = (payload: SocketErrorPayload): boolean => {
    const pending = payload.messageId ? pendingReactions.get(payload.messageId) : undefined;
    if (!payload.messageId || !pending) {
      return false;
    }
    pendingReactions.delete(payload.messageId);
    if (payload.code === STALE_ROOM_KEY_CODE && !pending.retried) {
      sendReaction(pending.payload, pending.keyId);
      return true;
    }
    return false;
  };

  const retriesStaleSend = (payload: unknown): boolean => {
    if (typeof payload !== 'object' || payload === null) {
      return false;
    }
    const decided = staleRetryDecisions.get(payload);
    if (decided !== undefined) {
      return decided;
    }
    if ((payload as SocketErrorPayload).event === REACT_EVENT) {
      const retryReaction = retriesStaleReaction(payload as SocketErrorPayload);
      staleRetryDecisions.set(payload, retryReaction);
      return retryReaction;
    }
    const { code, clientTempId } = payload as SocketErrorPayload;
    const pending = clientTempId ? pendingSends.get(clientTempId) : undefined;
    let retry = false;
    if (clientTempId && pending) {
      pendingSends.delete(clientTempId);
      if (code === STALE_ROOM_KEY_CODE && !pending.retried) {
        retry = true;
        sendEncrypted(pending.payload, pending.keyId);
      }
    }
    staleRetryDecisions.set(payload, retry);
    return retry;
  };

  genericSocket.on = (event: string, handler: AnyHandler) => {
    if (event === 'error') {
      const filtered = ((payload: unknown) => {
        if (!retriesStaleSend(payload)) {
          (handler as (value: unknown) => void)(payload);
        }
      }) as AnyHandler;
      getBucket(event).set(handler, filtered);
      return originalOn(event, filtered);
    }
    if (!DECRYPT_EVENTS.has(event)) {
      return originalOn(event, handler);
    }

    const previewOnly = previewOnlyHandlers.has(handler);
    const wrapped = ((payload: unknown) => {
      dispatchQueue = dispatchQueue
        .then(() => transformPayload(socket, event, payload, previewOnly))
        .catch((error: unknown) => {
          console.error(`[e2e] failed to process incoming "${event}" payload, delivering it undecrypted`, error);
          return payload;
        })
        .then((transformed) => {
          handler(transformed as never);
        });
    }) as AnyHandler;

    getBucket(event).set(handler, wrapped);
    return originalOn(event, wrapped);
  };

  genericSocket.off = (event?: string, handler?: AnyHandler) => {
    if (event && handler && (DECRYPT_EVENTS.has(event) || event === 'error')) {
      const bucket = wrappedHandlers.get(event);
      const wrapped = bucket?.get(handler);
      if (bucket && wrapped) {
        bucket.delete(handler);
        return originalOff(event, wrapped);
      }
    }
    return originalOff(event, handler);
  };

  genericSocket.emit = (event: string, ...args: unknown[]) => {
    if (event === 'message:send') {
      sendEncrypted(args[0] as OutgoingMessage, null);
      return socket;
    }
    if (event === REACT_EVENT) {
      sendReaction(args[0] as OutgoingReaction, null);
      return socket;
    }
    if (event === 'room:create-group') {
      const roomName = (args[0] as { roomName?: unknown } | undefined)?.roomName;
      pendingGroupName = typeof roomName === 'string' && roomName.trim().length > 0 ? roomName.trim() : null;
      return originalEmit(event, {});
    }
    return originalEmit(event, ...args);
  };

  const deferredRoomEvents: DeferredRoomEvents = new Map();
  const unsubscribeIdentity = subscribeCurrentIdentity((identity) => {
    if (!identity) {
      deferredRoomEvents.clear();
      return;
    }
    void ensureSigningKeyPublished(socket);
    const pending = Array.from(deferredRoomEvents.values());
    deferredRoomEvents.clear();
    for (const { room, event, groupName } of pending) {
      maybeEstablishRoomKey(socket, room, event, deferredRoomEvents, groupName);
    }
  });

  originalOn('user:resumed', (payload: { user?: SocketUser }) => {
    void ensureSigningKeyPublished(socket);
    applySelfUser(payload?.user);
  });

  const detachProfilePhotos = attachProfilePhotoSocket(socket);
  const detachKeyTransparency = attachKeyTransparency(socket);

  const closable = socket as unknown as { close: () => AppSocket };
  const originalClose = closable.close.bind(socket);
  closable.close = () => {
    unsubscribeIdentity();
    detachProfilePhotos();
    detachKeyTransparency();
    deferredRoomEvents.clear();
    pendingGroupName = null;
    return originalClose();
  };

  originalOn('user:registered', (payload: { user?: SocketUser }) => {
    applySelfUser(payload?.user);
  });
  originalOn('user:profile-updated-success', (payload: { user?: SocketUser }) => {
    applySelfUser(payload?.user);
  });

  originalOn('room:created', (payload: { room: RoomSummary; messages: MessageView[] }) => {
    applyRoomSummary(payload.room);
    maybeEstablishRoomKey(socket, payload.room, 'room:created', deferredRoomEvents, takeCreatedGroupName(payload.room));
  });
  originalOn('room:joined', (payload: { room: RoomSummary; messages: MessageView[] }) => {
    applyRoomSummary(payload.room);
    maybeEstablishRoomKey(socket, payload.room, 'room:joined', deferredRoomEvents);
  });
  originalOn('room:new', (payload: { room: RoomSummary; messages: MessageView[] }) => {
    applyRoomSummary(payload.room);
    maybeEstablishRoomKey(socket, payload.room, 'room:new', deferredRoomEvents);
  });
  originalOn('rooms:list', (payload: { rooms: RoomSummary[] }) => {
    applyRoomSummaries(payload.rooms);
    for (const room of payload.rooms) {
      maybeEstablishRoomKey(socket, room, 'rooms:list', deferredRoomEvents);
    }
  });

  originalOn('e2e:room-key', (payload: SealedRoomKeyEntry) => {
    void handleRoomKeyPush(socket, payload);
  });

  originalOn('e2e:rotation-required', (payload: { roomId: string; epoch: number; memberIds?: string[]; inviteProofs?: unknown }) => {
    void handleRotationRequired(socket, payload);
  });

  originalOn('group:user-joined', (payload: { roomId: string; participants: RoomParticipant[] }) => {
    void handleGroupUserJoined(socket, payload);
    applyRoomParticipants(payload.roomId, payload.participants);
  });

  originalOn('group:user-left', (payload: { roomId: string; participants: RoomParticipant[] }) => {
    updateRoomParticipants(payload.roomId, payload.participants);
    applyRoomParticipants(payload.roomId, payload.participants);
  });

  originalOn('group:participants-updated', (payload: { roomId: string; participants: RoomParticipant[] }) => {
    updateRoomParticipants(payload.roomId, payload.participants);
    applyRoomParticipants(payload.roomId, payload.participants);
  });

  originalOn('group:left', (payload: { roomId: string }) => {
    forgetRoom(payload.roomId);
  });

  originalOn('room:deleted', (payload: { roomId: string }) => {
    forgetRoom(payload.roomId);
  });

  originalOn('user:blocked', (payload: BlockStatusPayload) => {
    handleBlockStatus(payload);
  });

  originalOn('user:unblocked', (payload: BlockStatusPayload) => {
    handleBlockStatus(payload);
  });

  originalOn('user:avatar-updated', (payload: { userId: string; encryptedAvatar: string | null; profileKeyVersion: number }) => {
    handleUserAvatarUpdated(payload);
  });

  originalOn('room:avatar-updated', (payload: { roomId: string; encryptedAvatar: string | null; keyId: string | null }) => {
    handleRoomAvatarUpdated(payload);
  });

  originalOn('room:profile-keys-updated', (payload: { roomId: string; keyId: string; envelopes: Record<string, string> }) => {
    handleProfileKeysUpdated(payload);
  });

  originalOn('e2e:key-request', (payload: { roomId: string; requesterId: string; proof?: string | null }) => {
    void handleKeyRequest(socket, payload);
  });

  originalOn('room:name-updated', (payload: { roomId: string; encryptedName: string; keyId: string }) => {
    void handleRoomNameUpdated(socket, payload);
  });

  originalOn('room:invite-updated', (payload: { roomId: string; invite: unknown; roster?: unknown }) => {
    handleRoomInviteUpdated(payload);
  });

  originalOn('error', (payload: unknown) => {
    retriesStaleSend(payload);
    if (typeof payload === 'object' && payload !== null && (payload as SocketErrorPayload).event === 'room:reset-invite') {
      handleRoomInviteResetRejected(payload);
    }
  });

  originalOn('message:new', (payload: { clientTempId?: string }) => {
    if (payload.clientTempId) {
      pendingSends.delete(payload.clientTempId);
    }
  });

  originalOn('message:reactions-updated', (payload: { messageId?: string }) => {
    if (payload.messageId) {
      pendingReactions.delete(payload.messageId);
    }
  });

  originalOn('e2e:room-key-rejected', (payload: RoomKeyRejectedPayload) => {
    void handleRoomKeyRejected(socket, payload);
  });

  return socket;
}
