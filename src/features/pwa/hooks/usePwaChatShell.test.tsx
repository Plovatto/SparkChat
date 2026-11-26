import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSocket } from '@lib/socket';
import type { WorkerToClientMessage } from '../sw/protocol';
import { usePwaChatShell } from './usePwaChatShell';

const mocks = vi.hoisted(() => ({
  sync: vi.fn<(socket: unknown) => Promise<string | null>>(),
  workerListeners: new Set<(message: WorkerToClientMessage) => void>(),
}));

vi.mock('../lib/push-subscription', () => ({ syncPushSubscription: mocks.sync }));
vi.mock('../lib/launch-params', () => ({ takePendingLaunch: () => ({}), takePendingReminder: () => null }));
vi.mock('../lib/sw-registration', () => ({
  postToWorker: vi.fn(),
  onWorkerMessage: (listener: (message: WorkerToClientMessage) => void) => {
    mocks.workerListeners.add(listener);
    return () => mocks.workerListeners.delete(listener);
  },
}));

function fakeSocket(connected = true) {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  const socket = {
    connected,
    on: (event: string, handler: (...args: unknown[]) => void) => {
      if (!handlers.has(event)) {
        handlers.set(event, new Set());
      }
      handlers.get(event)!.add(handler);
      return socket;
    },
    off: (event: string, handler: (...args: unknown[]) => void) => {
      handlers.get(event)?.delete(handler);
      return socket;
    },
    fire: (event: string) => handlers.get(event)?.forEach((handler) => handler({})),
    listeners: (event: string) => handlers.get(event)?.size ?? 0,
  };
  return socket;
}

function render(socket: ReturnType<typeof fakeSocket> | null) {
  return renderHook(() =>
    usePwaChatShell({ socket: socket as unknown as AppSocket | null, selectedRoomId: null, language: 'pt', onOpenRoom: vi.fn(), onNewChat: vi.fn() }),
  );
}

describe('usePwaChatShell push sync', () => {
  beforeEach(() => {
    mocks.sync.mockReset();
    mocks.sync.mockResolvedValue(null);
    mocks.workerListeners.clear();
  });

  it('syncs the push subscription once when the authenticated shell mounts', () => {
    render(fakeSocket());
    expect(mocks.sync).toHaveBeenCalledTimes(1);
  });

  it('waits for the session to resume after a reconnect instead of subscribing before authentication', () => {
    const socket = fakeSocket();
    render(socket);
    mocks.sync.mockClear();

    socket.fire('connect');
    expect(mocks.sync).not.toHaveBeenCalled();

    socket.fire('user:resumed');
    expect(mocks.sync).toHaveBeenCalledTimes(1);
  });

  it('does not sync on mount while the socket is offline, but does once it resumes', () => {
    const socket = fakeSocket(false);
    render(socket);
    expect(mocks.sync).not.toHaveBeenCalled();
    socket.fire('user:resumed');
    expect(mocks.sync).toHaveBeenCalledTimes(1);
  });

  it('subscribes as soon as notifications become allowed from any place, not only on the next reconnect', async () => {
    const status = new EventTarget() as EventTarget & { state: PermissionState };
    status.state = 'default' as PermissionState;
    const query = vi.fn().mockResolvedValue(status);
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query } });
    try {
      const { unmount } = render(fakeSocket());
      await vi.waitFor(() => expect(query).toHaveBeenCalledWith({ name: 'notifications' }));
      await Promise.resolve();
      mocks.sync.mockClear();

      status.state = 'denied';
      status.dispatchEvent(new Event('change'));
      expect(mocks.sync).not.toHaveBeenCalled();

      status.state = 'granted';
      status.dispatchEvent(new Event('change'));
      expect(mocks.sync).toHaveBeenCalledTimes(1);

      unmount();
      status.dispatchEvent(new Event('change'));
      expect(mocks.sync).toHaveBeenCalledTimes(1);
    } finally {
      Reflect.deleteProperty(navigator, 'permissions');
    }
  });

  it('re-syncs when the service worker reports a changed subscription and stops listening on unmount', () => {
    const socket = fakeSocket();
    const { unmount } = render(socket);
    mocks.sync.mockClear();
    mocks.workerListeners.forEach((listener) => listener({ type: 'sparkchat:push-subscription-changed' }));
    expect(mocks.sync).toHaveBeenCalledTimes(1);

    unmount();
    expect(socket.listeners('user:resumed')).toBe(0);
  });
});
