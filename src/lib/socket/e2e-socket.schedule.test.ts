import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSocket } from './socket-client';

const e2ee = vi.hoisted(() => ({
  ensureRoomKeyForSending: vi.fn(),
  recoverFromStaleRoomKey: vi.fn(),
  encryptOutgoingMessage: vi.fn(),
}));

vi.mock('@lib/i18n/app-i18n', () => ({ translate: (key: string) => key }));

vi.mock('@lib/kt/kt-manager', () => ({ attachKeyTransparency: () => () => undefined }));

vi.mock('@lib/e2ee', () => ({
  ...e2ee,
  attachProfilePhotoSocket: () => () => undefined,
  subscribeCurrentIdentity: () => () => undefined,
  getCurrentIdentity: () => null,
  MissingRoomKeyError: class extends Error {},
}));

const { wrapSocketWithE2e } = await import('./e2e-socket');

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

const payload = { cardId: 'card-1', roomId: 'room-1', sendAt: 1_800_000_000_000, messageId: '11111111-1111-4111-8111-111111111111', content: 'oi', type: 'text', clientTempId: 't1' };

describe('wrapSocketWithE2e message:schedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    e2ee.ensureRoomKeyForSending.mockResolvedValue({ keyId: 'k'.repeat(22), epoch: 1, key: new Uint8Array(32) });
    e2ee.recoverFromStaleRoomKey.mockResolvedValue({ keyId: 'n'.repeat(22), epoch: 2, key: new Uint8Array(32) });
    e2ee.encryptOutgoingMessage.mockImplementation((message: { content: string }) =>
      Promise.resolve({ ...message, content: `e2e:v2:${message.content}`, messageId: 'm-1' }),
    );
  });

  it('seals the content for the room and emits message:schedule with the card id', async () => {
    const { socket } = createFakeSocket();
    const originalEmit = vi.spyOn(socket, 'emit');
    wrapSocketWithE2e(socket);

    socket.emit('message:schedule', payload as never);

    await vi.waitFor(() =>
      expect(originalEmit).toHaveBeenCalledWith(
        'message:schedule',
        expect.objectContaining({ cardId: 'card-1', roomId: 'room-1', sendAt: payload.sendAt, content: 'e2e:v2:oi' }),
      ),
    );
    expect(e2ee.ensureRoomKeyForSending).toHaveBeenCalledWith(socket, 'room-1');
    expect(originalEmit).not.toHaveBeenCalledWith('message:send', expect.anything());
  });

  it('retries a stale room key as message:schedule without surfacing the error', async () => {
    const { socket, receive } = createFakeSocket();
    const originalEmit = vi.spyOn(socket, 'emit');
    const appErrors: unknown[] = [];
    wrapSocketWithE2e(socket);
    socket.on('error', (error: unknown) => appErrors.push(error));
    socket.emit('message:schedule', payload as never);
    await vi.waitFor(() => expect(originalEmit).toHaveBeenCalledTimes(1));

    receive('error', { code: 'message.staleRoomKey', message: 'stale', clientTempId: 't1' });

    await vi.waitFor(() => expect(originalEmit).toHaveBeenCalledTimes(2));
    expect(originalEmit.mock.calls[1]?.[0]).toBe('message:schedule');
    expect(e2ee.recoverFromStaleRoomKey).toHaveBeenCalledWith(socket, 'room-1', 'k'.repeat(22));
    expect(appErrors).toHaveLength(0);
  });

  it('forgets the pending schedule when its card resolves', async () => {
    const { socket, receive } = createFakeSocket();
    const originalEmit = vi.spyOn(socket, 'emit');
    wrapSocketWithE2e(socket);
    socket.emit('message:schedule', payload as never);
    await vi.waitFor(() => expect(originalEmit).toHaveBeenCalledTimes(1));

    receive('message:card-resolved', { roomId: 'room-1', cardId: 'card-1', choice: 'yes' });
    receive('error', { code: 'message.staleRoomKey', message: 'stale', clientTempId: 't1' });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(originalEmit).toHaveBeenCalledTimes(1);
  });
});
