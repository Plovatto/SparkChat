import {
  decryptMessageView,
  decryptMessageViews,
  decryptRoomSummaries,
  decryptRoomSummary,
  encryptOutgoingMessage,
  ensureRoomKeyForDecryption,
  establishGroupRoomKeyOnCreate,
  ensureSigningKeyPublished,
  establishPrivateRoomKey,
  getCurrentIdentity,
  handleGroupUserJoined,
  handleIncomingRoomKeyPush,
  handleKeyRequest,
  handleRoomKeyRejected,
  MissingRoomKeyError,
  requestGroupRoomKeyIfMissing,
  subscribeCurrentIdentity,
  trackRoomParticipants,
} from '@lib/e2ee';
import { translate } from '@lib/i18n/app-i18n';
import type { AppSocket } from './socket-client';
import type { ClientToServerEvents, MessageView, RoomParticipant, RoomSummary } from './socket-events';

type AnyHandler = (...args: never[]) => void;
type GenericOn = (event: string, handler: AnyHandler) => AppSocket;
type GenericOff = (event?: string, handler?: AnyHandler) => AppSocket;
type GenericEmit = (event: string, ...args: unknown[]) => AppSocket;

type OutgoingMessage = Parameters<ClientToServerEvents['message:send']>[0];

function notifySendFailure(socket: AppSocket, clientTempId: string | undefined, error: unknown): void {
  const message = error instanceof MissingRoomKeyError ? error.message : translate('errors.e2ee.encryptFailed');
  for (const listener of socket.listeners('error')) {
    listener({ message, clientTempId });
  }
}

const DECRYPT_EVENTS =new Set(['message:new', 'messages:list', 'message:updated', 'room:created', 'room:joined', 'room:new', 'rooms:list']);

interface DeferredRoomEvent {
  room: RoomSummary;
  event: string;
}

type DeferredRoomEvents = Map<string, DeferredRoomEvent>;

function deferRoomEvent(deferred: DeferredRoomEvents, room: RoomSummary, event: string): void {
  const previous = deferred.get(room.id);
  const keepsActiveCreation = previous?.event === 'room:joined' && event !== 'room:joined';
  deferred.set(room.id, { room, event: keepsActiveCreation ? previous.event : event });
}

function maybeEstablishRoomKey(socket: AppSocket, room: RoomSummary, event: string, deferred: DeferredRoomEvents): void {
  trackRoomParticipants(room);

  const currentUserId = getCurrentIdentity()?.userId;
  if (!currentUserId) {
    deferRoomEvent(deferred, room, event);
    return;
  }
  if (!room.participants.some((participant) => participant.id === currentUserId)) {
    return;
  }

  if (room.type === 'private') {
    const isActiveCreationEvent = event === 'room:joined';
    void establishPrivateRoomKey(socket, room, currentUserId, isActiveCreationEvent);
  } else if (room.type === 'group') {
    void establishGroupRoomKeyOnCreate(socket, room, currentUserId);
    void requestGroupRoomKeyIfMissing(socket, room, currentUserId);
  }
}

async function transformPayload(socket: AppSocket, event: string, payload: unknown): Promise<unknown> {
  switch (event) {
    case 'message:new':
    case 'message:updated':
      return decryptMessageView(socket, payload as MessageView);

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

  genericSocket.on = (event: string, handler: AnyHandler) => {
    if (!DECRYPT_EVENTS.has(event)) {
      return originalOn(event, handler);
    }

    const wrapped = ((payload: unknown) => {
      dispatchQueue = dispatchQueue
        .then(() => transformPayload(socket, event, payload))
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
    if (event && handler && DECRYPT_EVENTS.has(event)) {
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
      const payload = args[0] as OutgoingMessage;
      void ensureRoomKeyForDecryption(socket, payload.roomId)
        .then(() => encryptOutgoingMessage(payload))
        .then((encrypted) => {
          originalEmit(event, encrypted);
        })
        .catch((error: unknown) => {
          console.error('[e2e] failed to encrypt outgoing message, not sending it', error);
          notifySendFailure(socket, payload.clientTempId, error);
        });
      return socket;
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
    for (const { room, event } of pending) {
      maybeEstablishRoomKey(socket, room, event, deferredRoomEvents);
    }
  });

  originalOn('user:resumed', () => {
    void ensureSigningKeyPublished(socket);
  });

  const closable = socket as unknown as { close: () => AppSocket };
  const originalClose = closable.close.bind(socket);
  closable.close = () => {
    unsubscribeIdentity();
    deferredRoomEvents.clear();
    return originalClose();
  };

  originalOn('room:created', (payload: { room: RoomSummary; messages: MessageView[] }) => {
    maybeEstablishRoomKey(socket, payload.room, 'room:created', deferredRoomEvents);
  });
  originalOn('room:joined', (payload: { room: RoomSummary; messages: MessageView[] }) => {
    maybeEstablishRoomKey(socket, payload.room, 'room:joined', deferredRoomEvents);
  });
  originalOn('room:new', (payload: { room: RoomSummary; messages: MessageView[] }) => {
    maybeEstablishRoomKey(socket, payload.room, 'room:new', deferredRoomEvents);
  });
  originalOn('rooms:list', (payload: { rooms: RoomSummary[] }) => {
    for (const room of payload.rooms) {
      maybeEstablishRoomKey(socket, room, 'rooms:list', deferredRoomEvents);
    }
  });

  originalOn('e2e:room-key', (payload: { roomId: string; sealedKey: string }) => {
    void handleIncomingRoomKeyPush(payload);
  });

  originalOn('group:user-joined', (payload: { roomId: string; participants: RoomParticipant[] }) => {
    void handleGroupUserJoined(socket, payload);
  });

  originalOn('e2e:key-request', (payload: { roomId: string; requesterId: string }) => {
    void handleKeyRequest(socket, payload);
  });

  originalOn('e2e:room-key-rejected', (payload: { roomId: string }) => {
    void handleRoomKeyRejected(socket, payload);
  });

  return socket;
}
