import { useEffect, useRef, useState } from 'react';
import { subscribeReminderActions, type ReminderAction } from '@features/pwa';
import type { AssistantButton } from '@lib/assistant/assistant-card';
import type { ChatMessage } from '../types';

const REMINDER_ACTION_TTL_MS = 15000;

interface PendingReminderAction extends ReminderAction {
  expiresAt: number;
}

interface UseReminderActionsOptions {
  roomId: string | null;
  isLoaded: boolean;
  messages: ChatMessage[];
  onQuickReply: (cardId: string, button: AssistantButton) => void;
}

function findReminderCard(messages: ChatMessage[], reminderId: string): ChatMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.card?.kind === 'reminder-fired' && message.card.reminderId === reminderId) {
      return message;
    }
  }
  return null;
}

export function useReminderActions({ roomId, isLoaded, messages, onQuickReply }: UseReminderActionsOptions): void {
  const [pending, setPending] = useState<PendingReminderAction[]>([]);
  const onQuickReplyRef = useRef(onQuickReply);
  onQuickReplyRef.current = onQuickReply;

  useEffect(
    () =>
      subscribeReminderActions((action) => {
        setPending((current) => [...current, { ...action, expiresAt: Date.now() + REMINDER_ACTION_TTL_MS }]);
      }),
    [],
  );

  useEffect(() => {
    if (pending.length === 0) {
      return;
    }
    const now = Date.now();
    const remaining: PendingReminderAction[] = [];
    for (const entry of pending) {
      if (entry.expiresAt <= now) {
        continue;
      }
      if (entry.roomId !== roomId || !isLoaded) {
        remaining.push(entry);
        continue;
      }
      const message = findReminderCard(messages, entry.reminderId);
      if (!message || message.card?.kind !== 'reminder-fired') {
        remaining.push(entry);
        continue;
      }
      if (message.resolvedChoice) {
        continue;
      }
      const button = message.card.buttons.find((candidate) => candidate.choice === entry.action);
      if (button) {
        onQuickReplyRef.current(message.id, button);
      }
    }
    if (remaining.length !== pending.length) {
      setPending(remaining);
    }
  }, [pending, roomId, isLoaded, messages]);

  useEffect(() => {
    if (pending.length === 0) {
      return;
    }
    const nextExpiry = Math.min(...pending.map((entry) => entry.expiresAt));
    const timer = window.setTimeout(() => setPending((current) => current.filter((entry) => entry.expiresAt > Date.now())), Math.max(0, nextExpiry - Date.now()) + 5);
    return () => window.clearTimeout(timer);
  }, [pending]);
}
