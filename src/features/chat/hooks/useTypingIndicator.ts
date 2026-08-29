import { useCallback, useEffect, useRef } from 'react';
import { useSocket } from '@lib/socket';

const TYPING_TIMEOUT_MS = 2000;

export interface TypingIndicatorControls {
  notifyTyping: () => void;
  notifyStoppedTyping: () => void;
}

export function useTypingIndicator(roomId: string | null): TypingIndicatorControls {
  const { socket } = useSocket();
  const isTypingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notifyStoppedTyping = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (isTypingRef.current && roomId) {
      isTypingRef.current = false;
      socket?.emit('typing:stop', { roomId });
    }
  }, [socket, roomId]);

  useEffect(() => {
    return () => {
      notifyStoppedTyping();
    };
  }, [roomId, notifyStoppedTyping]);

  const notifyTyping = useCallback(() => {
    if (!roomId) {
      return;
    }

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socket?.emit('typing:start', { roomId });
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(notifyStoppedTyping, TYPING_TIMEOUT_MS);
  }, [socket, roomId, notifyStoppedTyping]);

  return { notifyTyping, notifyStoppedTyping };
}
