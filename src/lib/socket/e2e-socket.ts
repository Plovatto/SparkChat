import {
  decryptMessageView,
  decryptMessageViews,
  decryptRoomSummaries,
  decryptRoomSummary,
  encryptOutgoingContent,
  encryptTextIfPossible,
  establishGroupRoomKeyOnCreate,
  establishPrivateRoomKey,
  getCurrentIdentity,
  handleGroupUserJoined,
  handleIncomingRoomKeyPush,
  handleKeyRequest,
  requestGroupRoomKeyIfMissing,
  trackRoomParticipants,
} from '@lib/e2ee';
import type { AppSocket } from './socket-client';
import type { MessageView, RoomParticipant, RoomSummary } from './socket-events';

type AnyHandler = (...args: never[]) => void;
type GenericOn = (event: string, handler: AnyHandler) => AppSocket;
type GenericOff = (event?: string, handler?: AnyHandler) => AppSocket;
type GenericEmit = (event: string, ...args: unknown[]) => AppSocket;

const DECRYPT_EVENTS = new Set(['message:new', 'messages:list', 'message:updated', 'room:created', 'room:joined', 'room:new', 'rooms:list']);

function maybeEstablishRoomKey(socket: AppSocket, room: RoomSummary, event: string): void {
  trackRoomParticipants(room);

  const currentUserId = getCurrentIdentity()?.userId;
  if (!currentUserId || !room.participants.some((participant) => participant.id === currentUserId)) {
    return;
  }

  if (room.type === 'private') {
    // 'room:joined' for a private room only ever fires once, for whoever actively called
    // room:create-private — every other discovery path (room:new, rooms:list) is passive.
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

  // Decrypting is async, but plain socket.io dispatches events to handlers strictly in arrival
  // order — existing code (e.g. useRoomMessages telling an initial page load apart from a
  // just-arrived live message) silently depends on that. Chaining every wrapped event through
  // one queue keeps that same in-order guarantee even though each payload takes a moment to
  // decrypt, instead of letting whichever one decrypts fastest jump ahead.
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
      const payload = args[0] as {
        roomId: string;
        type?: string;
        content: string;
        caption?: string;
        fileMeta?: { name: string; mimeType: string; size: number };
        linkPreview?: { url: string; title: string; description: string | null; imageUrl: string | null; siteName: string | null };
      };
      const contentPromise = encryptOutgoingContent(payload.roomId, payload.type ?? 'text', payload.content).catch(
        (error: unknown) => {
          console.error('[e2e] failed to encrypt outgoing message, sending it as-is', error);
          return payload.content;
        },
      );
      const captionPromise = payload.caption
        ? encryptTextIfPossible(payload.roomId, payload.caption).catch((error: unknown) => {
            console.error('[e2e] failed to encrypt outgoing caption, sending it as-is', error);
            return payload.caption as string;
          })
        : Promise.resolve(undefined);
      const fileMetaPromise = payload.fileMeta
        ? Promise.all([
            encryptTextIfPossible(payload.roomId, payload.fileMeta.name),
            encryptTextIfPossible(payload.roomId, payload.fileMeta.mimeType),
          ])
            .then(([name, mimeType]) => ({ ...payload.fileMeta, name, mimeType }))
            .catch((error: unknown) => {
              console.error('[e2e] failed to encrypt outgoing fileMeta, sending it as-is', error);
              return payload.fileMeta;
            })
        : Promise.resolve(undefined);

      const encryptNullable = (value: string | null): Promise<string | null> =>
        value ? encryptTextIfPossible(payload.roomId, value) : Promise.resolve(null);

      const linkPreviewPromise = payload.linkPreview
        ? Promise.all([
            encryptTextIfPossible(payload.roomId, payload.linkPreview.url),
            encryptTextIfPossible(payload.roomId, payload.linkPreview.title),
            encryptNullable(payload.linkPreview.description),
            encryptNullable(payload.linkPreview.imageUrl),
            encryptNullable(payload.linkPreview.siteName),
          ])
            .then(([url, title, description, imageUrl, siteName]) => ({ url, title, description, imageUrl, siteName }))
            .catch((error: unknown) => {
              console.error('[e2e] failed to encrypt outgoing linkPreview, sending it as-is', error);
              return payload.linkPreview;
            })
        : Promise.resolve(undefined);

      void Promise.all([contentPromise, captionPromise, fileMetaPromise, linkPreviewPromise]).then(
        ([content, caption, fileMeta, linkPreview]) => {
          originalEmit(event, {
            ...payload,
            content,
            ...(caption !== undefined ? { caption } : {}),
            ...(fileMeta !== undefined ? { fileMeta } : {}),
            ...(linkPreview !== undefined ? { linkPreview } : {}),
          });
        },
      );
      return socket;
    }
    return originalEmit(event, ...args);
  };

  // Registered once here (not inside transformPayload) so room-key establishment fires exactly
  // once per raw event no matter how many app-level consumers independently call
  // socket.on('room:joined' | ...) — transformPayload runs once per *registered handler*, which
  // would otherwise generate/overwrite the room key multiple times concurrently for one event.
  originalOn('room:created', (payload: { room: RoomSummary; messages: MessageView[] }) => {
    maybeEstablishRoomKey(socket, payload.room, 'room:created');
  });
  originalOn('room:joined', (payload: { room: RoomSummary; messages: MessageView[] }) => {
    maybeEstablishRoomKey(socket, payload.room, 'room:joined');
  });
  originalOn('room:new', (payload: { room: RoomSummary; messages: MessageView[] }) => {
    maybeEstablishRoomKey(socket, payload.room, 'room:new');
  });
  originalOn('rooms:list', (payload: { rooms: RoomSummary[] }) => {
    for (const room of payload.rooms) {
      maybeEstablishRoomKey(socket, room, 'rooms:list');
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

  return socket;
}
