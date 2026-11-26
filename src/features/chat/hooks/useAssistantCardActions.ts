import { useCallback, useEffect, useRef, useState } from 'react';
import { translateErrorPayload } from '@lib/api/api-error';
import { translate } from '@lib/i18n/app-i18n';
import type { AssistantButton, QuickReplyChoice } from '@lib/assistant/assistant-card';
import { localDateTimeToEpoch } from '@lib/assistant/schedule-time';
import type { AppSocket, SocketErrorPayload } from '@lib/socket';
import { sendTextToRoom } from '../utils/forward-message';
import type { ChatMessage } from '../types';

const SCHEDULE_TIMEOUT_MS = 15000;
const SCHEDULE_FAILED_KEY = 'chat.assistant.card.scheduleFailed';

export interface AssistantCardFailure {
  token: string;
  error: string;
}

interface UseAssistantCardActionsOptions {
  socket: AppSocket | null;
  messages: ChatMessage[];
  onQuickReply: (cardId: string, button: AssistantButton) => void;
}

interface PendingSchedule {
  cardId: string;
  timer: number;
}

export function useAssistantCardActions({ socket, messages, onQuickReply }: UseAssistantCardActionsOptions) {
  const [failures, setFailures] = useState<ReadonlyMap<string, AssistantCardFailure>>(new Map());
  const pendingRef = useRef(new Map<string, PendingSchedule>());
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const failureCounter = useRef(0);

  const clearFailure = useCallback((cardId: string) => {
    setFailures((current) => {
      if (!current.has(cardId)) {
        return current;
      }
      const next = new Map(current);
      next.delete(cardId);
      return next;
    });
  }, []);

  const fail = useCallback((cardId: string, error: string) => {
    failureCounter.current += 1;
    const token = `${cardId}:${failureCounter.current}`;
    setFailures((current) => new Map(current).set(cardId, { token, error }));
  }, []);

  const settle = useCallback((clientTempId: string) => {
    const pending = pendingRef.current.get(clientTempId);
    if (pending) {
      window.clearTimeout(pending.timer);
      pendingRef.current.delete(clientTempId);
    }
    return pending;
  }, []);

  useEffect(() => {
    if (!socket) {
      return;
    }
    const pendingSchedules = pendingRef.current;
    const handleError = (payload: SocketErrorPayload) => {
      if (!payload.clientTempId) {
        return;
      }
      const pending = settle(payload.clientTempId);
      if (pending) {
        fail(pending.cardId, translateErrorPayload(payload, SCHEDULE_FAILED_KEY));
      }
    };
    const handleResolved = ({ cardId }: { roomId: string; cardId: string; choice: QuickReplyChoice }) => {
      for (const [clientTempId, pending] of pendingSchedules) {
        if (pending.cardId === cardId) {
          settle(clientTempId);
        }
      }
      clearFailure(cardId);
    };
    socket.on('error', handleError);
    socket.on('message:card-resolved', handleResolved);
    return () => {
      socket.off('error', handleError);
      socket.off('message:card-resolved', handleResolved);
      for (const pending of pendingSchedules.values()) {
        window.clearTimeout(pending.timer);
      }
      pendingSchedules.clear();
    };
  }, [socket, settle, fail, clearFailure]);

  const schedule = useCallback(
    (message: ChatMessage, action: { roomId: string; text: string; sendAtLocal: string; timeZone: string }) => {
      const sendAt = localDateTimeToEpoch(action.sendAtLocal, action.timeZone);
      if (!socket || sendAt === null) {
        fail(message.id, translate(SCHEDULE_FAILED_KEY));
        return;
      }
      clearFailure(message.id);
      const clientTempId = crypto.randomUUID();
      const timer = window.setTimeout(() => {
        if (settle(clientTempId)) {
          fail(message.id, translate(SCHEDULE_FAILED_KEY));
        }
      }, SCHEDULE_TIMEOUT_MS);
      pendingRef.current.set(clientTempId, { cardId: message.id, timer });
      socket.emit('message:schedule', {
        cardId: message.id,
        roomId: action.roomId,
        sendAt,
        messageId: crypto.randomUUID(),
        content: action.text,
        type: 'text',
        clientTempId,
      });
    },
    [socket, fail, clearFailure, settle],
  );

  const sendNow = useCallback(
    (cardId: string, button: AssistantButton, roomId: string, text: string) => {
      if (!socket) {
        fail(cardId, translate(SCHEDULE_FAILED_KEY));
        return;
      }
      clearFailure(cardId);
      sendTextToRoom(socket, roomId, text).then(
        () => onQuickReply(cardId, button),
        (error: unknown) => fail(cardId, error instanceof Error && error.message ? error.message : translate(SCHEDULE_FAILED_KEY)),
      );
    },
    [socket, fail, clearFailure, onQuickReply],
  );

  const handleCardReply = useCallback(
    (cardId: string, button: AssistantButton) => {
      const message = messagesRef.current.find((candidate) => candidate.id === cardId);
      const card = message?.card;
      if (message && card?.kind === 'confirm' && card.action.type === 'scheduled-message' && button.choice === 'yes') {
        schedule(message, card.action);
        return;
      }
      if (card?.kind === 'scheduled-failed' && button.choice === 'send-now') {
        sendNow(cardId, button, card.roomId, card.text);
        return;
      }
      onQuickReply(cardId, button);
    },
    [schedule, sendNow, onQuickReply],
  );

  return { handleCardReply, failures };
}
