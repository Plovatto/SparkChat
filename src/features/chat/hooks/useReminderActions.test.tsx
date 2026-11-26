import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queueReminderAction } from '@features/pwa';
import type { ChatMessage } from '../types';
import { useReminderActions } from './useReminderActions';

const BUTTONS = [
  { choice: 'done' as const, label: 'Done' },
  { choice: 'snooze10' as const, label: 'Snooze 10 min' },
];

function card(id: string, reminderId: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    card: { v: 1, kind: 'reminder-fired', reminderId, text: 'Call mom', buttons: BUTTONS },
    ...extra,
  } as unknown as ChatMessage;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useReminderActions', () => {
  it('turns a snooze action into the matching quick reply on the latest card', () => {
    const onQuickReply = vi.fn();
    const messages = [card('old', 'rem1', { resolvedChoice: 'done' }), card('new', 'rem1'), card('other', 'rem2')];
    renderHook(() => useReminderActions({ roomId: 'room', isLoaded: true, messages, onQuickReply }));
    act(() => queueReminderAction({ reminderId: 'rem1', roomId: 'room', action: 'snooze10' }));
    expect(onQuickReply).toHaveBeenCalledTimes(1);
    expect(onQuickReply).toHaveBeenCalledWith('new', BUTTONS[1]);
  });

  it('waits for the room and messages to load before replying', () => {
    const onQuickReply = vi.fn();
    const { rerender } = renderHook(
      (props: { roomId: string | null; isLoaded: boolean; messages: ChatMessage[] }) => useReminderActions({ ...props, onQuickReply }),
      { initialProps: { roomId: 'other', isLoaded: true, messages: [] as ChatMessage[] } },
    );
    act(() => queueReminderAction({ reminderId: 'rem1', roomId: 'room', action: 'done' }));
    expect(onQuickReply).not.toHaveBeenCalled();
    rerender({ roomId: 'room', isLoaded: false, messages: [] });
    expect(onQuickReply).not.toHaveBeenCalled();
    rerender({ roomId: 'room', isLoaded: true, messages: [card('c1', 'rem1')] });
    expect(onQuickReply).toHaveBeenCalledWith('c1', BUTTONS[0]);
    rerender({ roomId: 'room', isLoaded: true, messages: [card('c1', 'rem1'), card('c2', 'rem3')] });
    expect(onQuickReply).toHaveBeenCalledTimes(1);
  });

  it('sends a single quick reply when the same reminder action arrives twice', () => {
    const onQuickReply = vi.fn();
    const messages = [card('c1', 'rem1')];
    renderHook(() => useReminderActions({ roomId: 'room', isLoaded: true, messages, onQuickReply }));
    act(() => {
      queueReminderAction({ reminderId: 'rem1', roomId: 'room', action: 'done' });
      queueReminderAction({ reminderId: 'rem1', roomId: 'room', action: 'done' });
    });
    act(() => queueReminderAction({ reminderId: 'rem1', roomId: 'room', action: 'done' }));
    expect(onQuickReply).toHaveBeenCalledTimes(1);
  });

  it('answers a re-fired card with the same reminder id after a snooze on the first card', () => {
    const onQuickReply = vi.fn();
    const first = [card('A', 'rem1')];
    const { rerender } = renderHook((props: { messages: ChatMessage[] }) => useReminderActions({ roomId: 'room', isLoaded: true, onQuickReply, ...props }), {
      initialProps: { messages: first },
    });
    act(() => queueReminderAction({ reminderId: 'rem1', roomId: 'room', action: 'snooze10' }));
    expect(onQuickReply).toHaveBeenLastCalledWith('A', BUTTONS[1]);
    rerender({ messages: [card('A', 'rem1', { resolvedChoice: 'snooze10' }), card('B', 'rem1')] });
    act(() => queueReminderAction({ reminderId: 'rem1', roomId: 'room', action: 'done' }));
    expect(onQuickReply).toHaveBeenCalledTimes(2);
    expect(onQuickReply).toHaveBeenLastCalledWith('B', BUTTONS[0]);
  });

  it('does nothing when the card is missing or already answered', () => {
    vi.useFakeTimers();
    const onQuickReply = vi.fn();
    const messages = [card('c1', 'rem1', { resolvedChoice: 'done' })];
    renderHook(() => useReminderActions({ roomId: 'room', isLoaded: true, messages, onQuickReply }));
    act(() => queueReminderAction({ reminderId: 'rem1', roomId: 'room', action: 'snooze10' }));
    act(() => queueReminderAction({ reminderId: 'missing', roomId: 'room', action: 'done' }));
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(onQuickReply).not.toHaveBeenCalled();
  });
});
