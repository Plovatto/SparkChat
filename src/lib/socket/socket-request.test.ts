import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSocket } from './socket-client';
import { setSocketAuthenticated } from './socket-auth-state';
import { requestOverSocket } from './socket-request';

type Handler = (...args: unknown[]) => void;

function fakeSocket(connected = true) {
  const handlers = new Map<string, Set<Handler>>();
  const sent: unknown[] = [];
  const socket = {
    connected,
    on: (event: string, handler: Handler) => {
      const bucket = handlers.get(event) ?? new Set<Handler>();
      bucket.add(handler);
      handlers.set(event, bucket);
      return socket;
    },
    off: (event: string, handler: Handler) => {
      handlers.get(event)?.delete(handler);
      return socket;
    },
    emit: (event: string, payload: unknown) => {
      sent.push([event, payload]);
      return socket;
    },
  };
  setSocketAuthenticated(socket, connected);
  const fire = (event: string, ...args: unknown[]) => {
    if (event === 'disconnect') {
      setSocketAuthenticated(socket, false);
    }
    if (event === 'user:resumed' || event === 'user:registered') {
      setSocketAuthenticated(socket, true);
    }
    for (const handler of Array.from(handlers.get(event) ?? [])) {
      handler(...args);
    }
  };
  const listeners = () => Array.from(handlers.values()).reduce((total, bucket) => total + bucket.size, 0);
  return { socket: socket as unknown as AppSocket, sent, fire, listeners, raw: socket };
}

function ask(fake: ReturnType<typeof fakeSocket>, overrides: { replyTimeoutMs?: number; maxWaitMs?: number } = {}) {
  return requestOverSocket<string>({
    socket: fake.socket,
    send: () => {
      fake.socket.emit('e2e:get-public-keys', { userIds: ['bob'] });
    },
    listen: (settle) => {
      const onReply = (value: unknown) => settle(String(value));
      fake.socket.on('e2e:public-keys', onReply);
      return () => {
        fake.socket.off('e2e:public-keys', onReply);
      };
    },
    fallback: 'fallback',
    replyTimeoutMs: overrides.replyTimeoutMs ?? 8000,
    maxWaitMs: overrides.maxWaitMs ?? 20000,
  });
}

describe('requestOverSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves with the reply and removes every listener', async () => {
    const fake = fakeSocket();
    const result = ask(fake);
    expect(fake.sent).toHaveLength(1);
    fake.fire('e2e:public-keys', 'keys');
    await expect(result).resolves.toBe('keys');
    expect(fake.listeners()).toBe(0);
  });

  it('falls back when no reply arrives in time', async () => {
    const fake = fakeSocket();
    const result = ask(fake);
    await vi.advanceTimersByTimeAsync(8000);
    await expect(result).resolves.toBe('fallback');
    expect(fake.listeners()).toBe(0);
  });

  it('sends the request again after the connection drops and authenticates again', async () => {
    const fake = fakeSocket();
    const result = ask(fake);
    await vi.advanceTimersByTimeAsync(3000);
    fake.fire('disconnect');
    await vi.advanceTimersByTimeAsync(7000);
    fake.fire('user:resumed');
    expect(fake.sent).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1000);
    fake.fire('e2e:public-keys', 'keys');
    await expect(result).resolves.toBe('keys');
  });

  it('restarts the reply wait after reauthenticating', async () => {
    const fake = fakeSocket();
    const result = ask(fake);
    fake.fire('disconnect');
    await vi.advanceTimersByTimeAsync(9000);
    fake.fire('user:registered');
    await vi.advanceTimersByTimeAsync(7999);
    fake.fire('e2e:public-keys', 'late');
    await expect(result).resolves.toBe('late');
  });

  it('does not send twice when the request was queued before authentication', async () => {
    const fake = fakeSocket(false);
    const result = ask(fake);
    await vi.advanceTimersByTimeAsync(10000);
    fake.fire('user:resumed');
    expect(fake.sent).toHaveLength(1);
    fake.fire('e2e:public-keys', 'keys');
    await expect(result).resolves.toBe('keys');
  });

  it('does not resend a request that was still queued when the connection dropped', async () => {
    const fake = fakeSocket();
    setSocketAuthenticated(fake.raw, false);
    const result = ask(fake);
    fake.fire('disconnect');
    fake.fire('user:resumed');
    expect(fake.sent).toHaveLength(1);
    fake.fire('e2e:public-keys', 'keys');
    await expect(result).resolves.toBe('keys');
  });

  it('gives up after the overall limit even while reconnecting', async () => {
    const fake = fakeSocket();
    const result = ask(fake);
    fake.fire('disconnect');
    await vi.advanceTimersByTimeAsync(20000);
    await expect(result).resolves.toBe('fallback');
    expect(fake.listeners()).toBe(0);
  });

  it('waits for an asynchronous settle value without timing out', async () => {
    const fake = fakeSocket();
    let release: (value: string) => void = () => undefined;
    const result = requestOverSocket<string>({
      socket: fake.socket,
      send: () => undefined,
      listen: (settle) => {
        const onReply = () => settle(new Promise<string>((resolve) => (release = resolve)));
        fake.socket.on('e2e:public-keys', onReply);
        return () => fake.socket.off('e2e:public-keys', onReply);
      },
      fallback: 'fallback',
      replyTimeoutMs: 100,
      maxWaitMs: 200,
    });
    fake.fire('e2e:public-keys');
    await vi.advanceTimersByTimeAsync(1000);
    release('verified');
    await expect(result).resolves.toBe('verified');
  });
});
