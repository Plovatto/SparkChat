import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageView, RoomSummary } from '@lib/socket';
import { useMessageNotifications } from './useMessageNotifications';

const handlers = new Map<string, (message: MessageView) => void>();
const socket = {
  on: (event: string, handler: (message: MessageView) => void) => handlers.set(event, handler),
  off: (event: string) => handlers.delete(event),
};

const playNotificationSound = vi.fn<() => void>();
const showPageNotification = vi.fn<(...args: unknown[]) => void>();

vi.mock('@lib/socket', () => ({
  useSocket: () => ({ socket }),
  markPreviewOnlyHandler: <T,>(handler: T) => handler,
}));
vi.mock('../utils/play-notification-sound', () => ({ playNotificationSound: () => { playNotificationSound(); } }));
vi.mock('../utils/show-page-notification', () => ({ showPageNotification: (...args: unknown[]) => { showPageNotification(...args); } }));
vi.mock('../utils/build-notification-content', () => ({
  buildNotificationContent: () => Promise.resolve({ title: 'Bob', body: 'oi', icon: undefined, image: undefined }),
}));

const room = { id: 'room-1' } as RoomSummary;
const message = { id: 'm1', roomId: 'room-1', type: 'text', sender: { id: 'bob' } } as unknown as MessageView;

function mount(isChatCovered?: () => boolean) {
  return renderHook(() => useMessageNotifications([room], 'alice', 'room-1', new Set(), true, true, () => undefined, true, isChatCovered));
}

async function deliver(): Promise<void> {
  handlers.get('message:new')?.(message);
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  playNotificationSound.mockClear();
  showPageNotification.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  handlers.clear();
});

describe('useMessageNotifications', () => {
  it('stays quiet for the open, focused conversation', async () => {
    mount();
    await deliver();
    expect(playNotificationSound).not.toHaveBeenCalled();
    expect(showPageNotification).not.toHaveBeenCalled();
  });

  it('notifies about the open conversation while the call screen covers it', async () => {
    let covered = true;
    mount(() => covered);
    await deliver();
    expect(playNotificationSound).toHaveBeenCalledTimes(1);
    expect(showPageNotification).toHaveBeenCalledTimes(1);

    covered = false;
    await deliver();
    expect(playNotificationSound).toHaveBeenCalledTimes(1);
  });
});
