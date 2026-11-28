import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JUMP_PAGE_SIZE, MAX_JUMP_PAGES, useJumpToMessage } from './useJumpToMessage';

interface Props {
  roomId: string | null;
  messageCount: number;
  hasMoreOlder: boolean;
  isLoadingOlder: boolean;
}

function setup(loaded: Set<string>, initial: Partial<Props> = {}) {
  const loadOlderMessages = vi.fn();
  const jump = vi.fn((messageId: string) => loaded.has(messageId));
  const hook = renderHook((props: Props) => useJumpToMessage({ ...props, loadOlderMessages, jump }), {
    initialProps: { roomId: 'room-1', messageCount: 10, hasMoreOlder: true, isLoadingOlder: false, ...initial },
  });
  return { hook, loadOlderMessages, jump };
}

describe('useJumpToMessage', () => {
  it('scrolls straight to a message that is already loaded', () => {
    const { hook, loadOlderMessages, jump } = setup(new Set(['m1']));

    act(() => hook.result.current('m1'));

    expect(jump).toHaveBeenCalledWith('m1');
    expect(loadOlderMessages).not.toHaveBeenCalled();
  });

  it('loads older pages until the replied message shows up, then scrolls to it', () => {
    const loaded = new Set<string>();
    const { hook, loadOlderMessages, jump } = setup(loaded);

    act(() => hook.result.current('old'));
    expect(loadOlderMessages).toHaveBeenCalledWith(JUMP_PAGE_SIZE);

    hook.rerender({ roomId: 'room-1', messageCount: 10, hasMoreOlder: true, isLoadingOlder: true });
    hook.rerender({ roomId: 'room-1', messageCount: 110, hasMoreOlder: true, isLoadingOlder: false });
    expect(loadOlderMessages).toHaveBeenCalledTimes(2);

    loaded.add('old');
    hook.rerender({ roomId: 'room-1', messageCount: 110, hasMoreOlder: true, isLoadingOlder: true });
    hook.rerender({ roomId: 'room-1', messageCount: 210, hasMoreOlder: true, isLoadingOlder: false });

    expect(jump).toHaveBeenLastCalledWith('old');
    expect(loadOlderMessages).toHaveBeenCalledTimes(2);

    hook.rerender({ roomId: 'room-1', messageCount: 211, hasMoreOlder: true, isLoadingOlder: false });
    expect(loadOlderMessages).toHaveBeenCalledTimes(2);
  });

  it('stops when the history runs out without finding the message', () => {
    const { hook, loadOlderMessages } = setup(new Set());

    act(() => hook.result.current('gone'));
    hook.rerender({ roomId: 'room-1', messageCount: 40, hasMoreOlder: false, isLoadingOlder: false });
    hook.rerender({ roomId: 'room-1', messageCount: 41, hasMoreOlder: true, isLoadingOlder: false });

    expect(loadOlderMessages).toHaveBeenCalledTimes(1);
  });

  it('does not load anything when there is no older history', () => {
    const { hook, loadOlderMessages } = setup(new Set(), { hasMoreOlder: false });

    act(() => hook.result.current('gone'));

    expect(loadOlderMessages).not.toHaveBeenCalled();
  });

  it('gives up after the page budget', () => {
    const { hook, loadOlderMessages } = setup(new Set());

    act(() => hook.result.current('far'));
    for (let page = 1; page <= MAX_JUMP_PAGES + 5; page += 1) {
      hook.rerender({ roomId: 'room-1', messageCount: 10 + page * JUMP_PAGE_SIZE, hasMoreOlder: true, isLoadingOlder: false });
    }

    expect(loadOlderMessages).toHaveBeenCalledTimes(MAX_JUMP_PAGES);
  });

  it('forgets a pending jump when the room changes', () => {
    const { hook, loadOlderMessages } = setup(new Set());

    act(() => hook.result.current('old'));
    hook.rerender({ roomId: 'room-2', messageCount: 10, hasMoreOlder: true, isLoadingOlder: false });
    hook.rerender({ roomId: 'room-2', messageCount: 20, hasMoreOlder: true, isLoadingOlder: false });

    expect(loadOlderMessages).toHaveBeenCalledTimes(1);
  });
});
