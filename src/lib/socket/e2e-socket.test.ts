import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSocket } from './socket-client';
import type { RoomSummary } from './socket-events';

const identityState = vi.hoisted(() => ({
  current: null as { userId: string; publicKey: string; privateKey: Uint8Array } | null,
  listeners: new Set<(identity: unknown) => void>(),
}));

const trackRoom = vi.hoisted(() => vi.fn());
const decryptMessageViewSpy = vi.hoisted(() => vi.fn((first: unknown) => Promise.resolve(first)));
const ensureSigningKeyPublished = vi.hoisted(() => vi.fn());
const roomKeyHandlers = vi.hoisted(() => ({
  handleRoomKeyPush: vi.fn(),
  handleRoomKeyRejected: vi.fn(),
  handleRotationRequired: vi.fn(),
  handleRoomNameUpdated: vi.fn(),
  handleGroupUserJoined: vi.fn(),
  handleKeyRequest: vi.fn(),
  updateRoomParticipants: vi.fn(),
  ensureRoomKeyForSending: vi.fn(),
  recoverFromStaleRoomKey: vi.fn(),
  encryptOutgoingMessage: vi.fn(),
}));

const profilePhotoHandlers = vi.hoisted(() => ({
  applyRoomParticipants: vi.fn(),
  applyRoomSummary: vi.fn(),
  applySelfUser: vi.fn(),
  attachProfilePhotoSocket: vi.fn(() => () => undefined),
  forgetRoom: vi.fn(),
  handleBlockStatus: vi.fn(),
  handleProfileKeysUpdated: vi.fn(),
  handleRoomAvatarUpdated: vi.fn(),
  handleUserAvatarUpdated: vi.fn(),
}));

vi.mock('@lib/i18n/app-i18n', () => ({ translate: (key: string) => key }));

vi.mock('@lib/e2ee', () => ({
  decryptMessageView: decryptMessageViewSpy,
  decryptMessageViews: (messages: unknown) => Promise.resolve(messages),
  decryptRoomSummaries: (rooms: unknown) => Promise.resolve(rooms),
  decryptRoomSummary: (room: unknown) => Promise.resolve(room),
  ...roomKeyHandlers,
  ...profilePhotoHandlers,
  ensureSigningKeyPublished,
  trackRoom,
  getCurrentIdentity: () => identityState.current,
  subscribeCurrentIdentity: (listener: (identity: unknown) => void) => {
    identityState.listeners.add(listener);
    return () => identityState.listeners.delete(listener);
  },
  MissingRoomKeyError: class extends Error {},
}));

const { markPreviewOnlyHandler, wrapSocketWithE2e } = await import('./e2e-socket');

type Handler = (payload: unknown) => void;

function createFakeSocket() {
  const handlers = new Map<string, Set<Handler>>();
  const socket = {
    on(event: string, handler: Handler) {
      const bucket = handlers.get(event) ?? new Set<Handler>();
      bucket.add(handler);
      handlers.set(event, bucket);
      return socket;
    },
    off(event: string, handler: Handler) {
      handlers.get(event)?.delete(handler);
      return socket;
    },
    emit: vi.fn(() => socket),
    close: vi.fn(() => socket),
    listeners: (event: string) => Array.from(handlers.get(event) ?? []),
  };
  const receive = (event: string, payload: unknown) => {
    for (const handler of Array.from(handlers.get(event) ?? [])) {
      handler(payload);
    }
  };
  return { socket: socket as unknown as AppSocket, receive };
}

function setIdentity(userId: string | null): void {
  identityState.current = userId ? { userId, publicKey: 'public', privateKey: new Uint8Array(32) } : null;
  for (const listener of Array.from(identityState.listeners)) {
    listener(identityState.current);
  }
}

const privateRoom = {
  id: 'room-1',
  type: 'private',
  participants: [
    { id: 'me', nickname: 'Me' },
    { id: 'assistant', nickname: 'SparkAI' },
  ],
} as unknown as RoomSummary;

describe('wrapSocketWithE2e room key setup', () => {
  beforeEach(() => {
    identityState.current = null;
    identityState.listeners.clear();
    trackRoom.mockClear();
    ensureSigningKeyPublished.mockClear();
  });

  it('publishes the signing key when an identity becomes available and not when it is cleared', () => {
    const { socket } = createFakeSocket();
    wrapSocketWithE2e(socket);

    setIdentity('me');
    expect(ensureSigningKeyPublished).toHaveBeenCalledExactlyOnceWith(socket);

    setIdentity(null);
    expect(ensureSigningKeyPublished).toHaveBeenCalledOnce();
  });

  it('publishes the signing key again after the session is resumed', () => {
    const { socket, receive } = createFakeSocket();
    wrapSocketWithE2e(socket);
    ensureSigningKeyPublished.mockClear();

    receive('user:resumed', { user: { id: 'me' }, authMethod: 'password' });

    expect(ensureSigningKeyPublished).toHaveBeenCalledExactlyOnceWith(socket);
  });

  it('establishes the key right away when the identity is ready', () => {
    setIdentity('me');
    const { socket, receive } = createFakeSocket();
    wrapSocketWithE2e(socket);

    receive('room:joined', { room: privateRoom, messages: [] });

    expect(trackRoom).toHaveBeenCalledWith(socket, privateRoom, { activeCreation: true });
  });

  it('waits for the identity before establishing the key of a room created earlier', () => {
    const { socket, receive } = createFakeSocket();
    wrapSocketWithE2e(socket);

    receive('room:joined', { room: privateRoom, messages: [] });
    expect(trackRoom).not.toHaveBeenCalled();

    setIdentity('me');

    expect(trackRoom).toHaveBeenCalledTimes(1);
    expect(trackRoom).toHaveBeenCalledWith(socket, privateRoom, { activeCreation: true });
  });

  it('keeps the active creation when a passive listing arrives before the identity', () => {
    const { socket, receive } = createFakeSocket();
    wrapSocketWithE2e(socket);

    receive('room:joined', { room: privateRoom, messages: [] });
    receive('rooms:list', { rooms: [privateRoom] });
    setIdentity('me');

    expect(trackRoom).toHaveBeenCalledTimes(1);
    expect(trackRoom).toHaveBeenCalledWith(socket, privateRoom, { activeCreation: true });
  });

  it('drops deferred rooms when the identity is cleared', () => {
    const { socket, receive } = createFakeSocket();
    wrapSocketWithE2e(socket);

    receive('room:joined', { room: privateRoom, messages: [] });
    setIdentity(null);
    setIdentity('me');

    expect(trackRoom).not.toHaveBeenCalled();
  });

  it('stops listening for identity changes once the socket is closed', () => {
    const { socket, receive } = createFakeSocket();
    wrapSocketWithE2e(socket);

    receive('room:joined', { room: privateRoom, messages: [] });
    socket.close();
    setIdentity('me');

    expect(trackRoom).not.toHaveBeenCalled();
    expect(identityState.listeners.size).toBe(0);
  });
});

describe('wrapSocketWithE2e room key events', () => {
  beforeEach(() => {
    identityState.current = null;
    identityState.listeners.clear();
    for (const handler of Object.values(roomKeyHandlers)) {
      handler.mockReset();
    }
    trackRoom.mockClear();
  });

  it('tracks a listed room as a passive event', () => {
    setIdentity('me');
    const { socket, receive } = createFakeSocket();
    wrapSocketWithE2e(socket);

    receive('rooms:list', { rooms: [privateRoom] });

    expect(trackRoom).toHaveBeenCalledWith(socket, privateRoom, { activeCreation: false });
  });

  it('routes room key, rejection, rotation and key request events to the room key module', () => {
    const { socket, receive } = createFakeSocket();
    wrapSocketWithE2e(socket);
    const entry = { roomId: 'room-1', keyId: 'k'.repeat(22), epoch: 2, senderId: 'ana', sealedKey: '{}' };

    receive('e2e:room-key', entry);
    receive('e2e:room-key-rejected', { roomId: 'room-1', epoch: 2 });
    receive('e2e:rotation-required', { roomId: 'room-1', epoch: 3 });
    receive('e2e:key-request', { roomId: 'room-1', requesterId: 'bia' });

    expect(roomKeyHandlers.handleRoomKeyPush).toHaveBeenCalledWith(socket, entry);
    expect(roomKeyHandlers.handleRoomKeyRejected).toHaveBeenCalledWith(socket, { roomId: 'room-1', epoch: 2 });
    expect(roomKeyHandlers.handleRotationRequired).toHaveBeenCalledWith(socket, { roomId: 'room-1', epoch: 3 });
    expect(roomKeyHandlers.handleKeyRequest).toHaveBeenCalledWith(socket, { roomId: 'room-1', requesterId: 'bia' });
  });

  it('keeps the member view in sync when members join, leave or are removed', () => {
    const { socket, receive } = createFakeSocket();
    wrapSocketWithE2e(socket);
    const participants = [{ id: 'me' }, { id: 'ana' }];

    receive('group:user-joined', { roomId: 'room-1', participants });
    receive('group:user-left', { roomId: 'room-1', userId: 'bia', userName: 'bia', participants });
    receive('group:participants-updated', { roomId: 'room-1', participants });

    expect(roomKeyHandlers.handleGroupUserJoined).toHaveBeenCalledWith(socket, { roomId: 'room-1', participants });
    expect(roomKeyHandlers.updateRoomParticipants).toHaveBeenCalledTimes(2);
    expect(roomKeyHandlers.updateRoomParticipants).toHaveBeenCalledWith('room-1', participants);
  });

  it('makes sure a sendable room key exists before encrypting an outgoing message', async () => {
    const { socket } = createFakeSocket();
    const originalEmit = vi.spyOn(socket, 'emit');
    roomKeyHandlers.ensureRoomKeyForSending.mockResolvedValue({ keyId: 'k'.repeat(22), epoch: 1, key: new Uint8Array(32) });
    roomKeyHandlers.encryptOutgoingMessage.mockImplementation((payload: object) => Promise.resolve({ ...payload, content: 'sealed' }));
    wrapSocketWithE2e(socket);

    socket.emit('message:send', { roomId: 'room-1', content: 'oi', type: 'text', clientTempId: 't1' });

    await vi.waitFor(() => expect(originalEmit).toHaveBeenCalledWith('message:send', expect.objectContaining({ content: 'sealed' })));
    expect(roomKeyHandlers.ensureRoomKeyForSending).toHaveBeenCalledWith(socket, 'room-1');
  });

  it('never sends a message when no sendable room key can be obtained', async () => {
    const { socket } = createFakeSocket();
    const originalEmit = vi.spyOn(socket, 'emit');
    const errors: unknown[] = [];
    socket.on('error', (payload: unknown) => errors.push(payload));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    roomKeyHandlers.ensureRoomKeyForSending.mockRejectedValue(new Error('no key'));
    wrapSocketWithE2e(socket);

    socket.emit('message:send', { roomId: 'room-1', content: 'oi', type: 'text', clientTempId: 't1' });

    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(originalEmit).not.toHaveBeenCalledWith('message:send', expect.anything());
    expect(roomKeyHandlers.encryptOutgoingMessage).not.toHaveBeenCalled();
  });

  describe('stale room key on send', () => {
    const generation = (keyId: string) => ({ keyId: keyId.repeat(22), epoch: 1, key: new Uint8Array(32) });
    const stale = { message: 'stale', code: 'message.staleRoomKey', clientTempId: 't1' };

    function setup() {
      const fake = createFakeSocket();
      const sent = vi.spyOn(fake.socket, 'emit');
      const appErrors: unknown[] = [];
      roomKeyHandlers.ensureRoomKeyForSending.mockResolvedValue(generation('a'));
      roomKeyHandlers.recoverFromStaleRoomKey.mockResolvedValue(generation('b'));
      roomKeyHandlers.encryptOutgoingMessage.mockImplementation((payload: object) =>
        Promise.resolve({ ...payload, messageId: crypto.randomUUID(), content: 'sealed' }),
      );
      wrapSocketWithE2e(fake.socket);
      const appHandler = (payload: unknown) => appErrors.push(payload);
      fake.socket.on('error', appHandler);
      return { ...fake, sent, appErrors, appHandler };
    }

    const sends = (sent: { mock: { calls: unknown[][] } }) => sent.mock.calls.filter((call) => call[0] === 'message:send');

    it('recovers the current generation and retries once without surfacing the error', async () => {
      const { socket, receive, sent, appErrors } = setup();
      socket.emit('message:send', { roomId: 'room-1', content: 'oi', type: 'text', clientTempId: 't1' });
      await vi.waitFor(() => expect(sends(sent)).toHaveLength(1));

      receive('error', stale);

      await vi.waitFor(() => expect(sends(sent)).toHaveLength(2));
      expect(roomKeyHandlers.recoverFromStaleRoomKey).toHaveBeenCalledWith(socket, 'room-1', 'a'.repeat(22));
      expect(appErrors).toHaveLength(0);
      const [first, second] = sends(sent).map((call) => call[1] as { messageId: string });
      expect(first?.messageId).toBeTruthy();
      expect(second?.messageId).toBeTruthy();
    });

    it('surfaces a second stale rejection instead of retrying forever', async () => {
      const { socket, receive, sent, appErrors } = setup();
      socket.emit('message:send', { roomId: 'room-1', content: 'oi', type: 'text', clientTempId: 't1' });
      await vi.waitFor(() => expect(sends(sent)).toHaveLength(1));
      receive('error', { ...stale });
      await vi.waitFor(() => expect(sends(sent)).toHaveLength(2));

      receive('error', { ...stale });

      expect(appErrors).toHaveLength(1);
      expect(sends(sent)).toHaveLength(2);
    });

    it('delivers other errors and forgets messages that were confirmed', async () => {
      const { socket, receive, sent, appErrors } = setup();
      socket.emit('message:send', { roomId: 'room-1', content: 'oi', type: 'text', clientTempId: 't1' });
      await vi.waitFor(() => expect(sends(sent)).toHaveLength(1));
      receive('message:new', { id: 'm1', clientTempId: 't1' });

      receive('error', stale);
      receive('error', { message: 'blocked', code: 'message.blocked', clientTempId: 't2' });

      expect(appErrors).toHaveLength(2);
      expect(roomKeyHandlers.recoverFromStaleRoomKey).not.toHaveBeenCalled();
    });

    it('stops delivering errors to a handler that was removed', () => {
      const { socket, receive, appErrors, appHandler } = setup();
      socket.off('error', appHandler);
      receive('error', { message: 'x' });
      expect(appErrors).toHaveLength(0);
    });
  });
});

describe('wrapSocketWithE2e group names', () => {
  const groupRoom = {
    id: 'group-1',
    type: 'group',
    creatorId: 'me',
    currentEpoch: 0,
    participants: [{ id: 'me', nickname: 'Me' }],
  } as unknown as RoomSummary;

  beforeEach(() => {
    identityState.current = null;
    identityState.listeners.clear();
    trackRoom.mockClear();
    roomKeyHandlers.handleRoomNameUpdated.mockClear();
  });

  it('never sends the plaintext group name and hands it to the first generation of the created group', () => {
    setIdentity('me');
    const { socket, receive } = createFakeSocket();
    const { emit } = socket as unknown as { emit: ReturnType<typeof vi.fn> };
    wrapSocketWithE2e(socket);

    socket.emit('room:create-group', { roomName: '  Weekend trip ' });

    expect(emit).toHaveBeenCalledWith('room:create-group', {});
    expect(JSON.stringify(emit.mock.calls)).not.toContain('Weekend');

    receive('room:created', { room: groupRoom, messages: [] });
    receive('room:created', { room: { ...groupRoom, id: 'group-2' }, messages: [] });

    expect(trackRoom).toHaveBeenNthCalledWith(1, socket, groupRoom, { activeCreation: false, groupName: 'Weekend trip' });
    expect(trackRoom).toHaveBeenNthCalledWith(2, socket, { ...groupRoom, id: 'group-2' }, { activeCreation: false });
  });

  it('does not give the pending name to a group created by someone else', () => {
    setIdentity('me');
    const { socket, receive } = createFakeSocket();
    wrapSocketWithE2e(socket);
    socket.emit('room:create-group', { roomName: 'Mine' });

    const foreign = { ...groupRoom, id: 'group-3', creatorId: 'other' } as unknown as RoomSummary;
    receive('room:created', { room: foreign, messages: [] });

    expect(trackRoom).toHaveBeenCalledWith(socket, foreign, { activeCreation: false });
  });

  it('forwards encrypted name updates to the room key layer', () => {
    const { socket, receive } = createFakeSocket();
    wrapSocketWithE2e(socket);
    const payload = { roomId: 'group-1', encryptedName: 'e2e:v2:x', keyId: 'k' };

    receive('room:name-updated', payload);

    expect(roomKeyHandlers.handleRoomNameUpdated).toHaveBeenCalledWith(socket, payload);
  });
});

describe('wrapSocketWithE2e profile photos', () => {
  beforeEach(() => {
    identityState.current = null;
    identityState.listeners.clear();
    for (const handler of Object.values(profilePhotoHandlers)) {
      handler.mockClear();
    }
  });

  it('registers the socket and detaches it when the socket closes', () => {
    const detach = vi.fn();
    profilePhotoHandlers.attachProfilePhotoSocket.mockReturnValueOnce(detach);
    const { socket } = createFakeSocket();
    wrapSocketWithE2e(socket);

    expect(profilePhotoHandlers.attachProfilePhotoSocket).toHaveBeenCalledWith(socket);
    socket.close();
    expect(detach).toHaveBeenCalledOnce();
  });

  it('feeds room summaries, participants and photo events into the profile photo store even without an identity', () => {
    const { socket, receive } = createFakeSocket();
    wrapSocketWithE2e(socket);

    receive('rooms:list', { rooms: [privateRoom] });
    receive('room:new', { room: privateRoom, messages: [] });
    receive('group:participants-updated', { roomId: 'room-1', participants: [] });
    receive('group:left', { roomId: 'room-1' });
    receive('user:avatar-updated', { userId: 'u2', encryptedAvatar: null, profileKeyVersion: 2 });
    receive('room:avatar-updated', { roomId: 'room-1', encryptedAvatar: null, keyId: null });
    receive('room:profile-keys-updated', { roomId: 'room-1', keyId: 'k', envelopes: {} });
    receive('user:blocked', { roomId: 'room-1', blockedBy: { me: 'u2' }, isBlocking: true });
    receive('user:resumed', { user: { id: 'me', profileKeyVersion: 3 }, authMethod: 'password' });

    expect(profilePhotoHandlers.applyRoomSummary).toHaveBeenCalledTimes(2);
    expect(profilePhotoHandlers.applyRoomParticipants).toHaveBeenCalledWith('room-1', []);
    expect(profilePhotoHandlers.forgetRoom).toHaveBeenCalledWith('room-1');
    expect(profilePhotoHandlers.handleUserAvatarUpdated).toHaveBeenCalledWith({ userId: 'u2', encryptedAvatar: null, profileKeyVersion: 2 });
    expect(profilePhotoHandlers.handleRoomAvatarUpdated).toHaveBeenCalledOnce();
    expect(profilePhotoHandlers.handleProfileKeysUpdated).toHaveBeenCalledOnce();
    expect(profilePhotoHandlers.handleBlockStatus).toHaveBeenCalledOnce();
    expect(profilePhotoHandlers.applySelfUser).toHaveBeenCalledWith({ id: 'me', profileKeyVersion: 3 });
  });
});

describe('wrapSocketWithE2e preview only handlers', () => {
  it('asks to skip gif media only for handlers that just show a label', async () => {
    decryptMessageViewSpy.mockClear();
    const { socket, receive } = createFakeSocket();
    const wrapped = wrapSocketWithE2e(socket);
    const bubble = vi.fn();
    const preview = markPreviewOnlyHandler(vi.fn());
    wrapped.on('message:new', bubble);
    wrapped.on('message:new', preview);

    receive('message:new', { id: 'm1' });
    await vi.waitFor(() => expect(preview).toHaveBeenCalled());

    expect(decryptMessageViewSpy).toHaveBeenCalledTimes(2);
    expect(decryptMessageViewSpy.mock.calls.map((call) => (call as unknown[])[2])).toEqual([{ deferGifMedia: false }, { deferGifMedia: true }]);
  });
});
