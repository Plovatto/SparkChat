import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { jumpToMessage } from '../utils/jump-to-message';

export const JUMP_PAGE_SIZE = 100;
export const MAX_JUMP_PAGES = 20;

export type JumpToMessage = (messageId: string) => void;

export const JumpToMessageContext = createContext<JumpToMessage | null>(null);

export function useJumpToMessageAction(): JumpToMessage {
  return useContext(JumpToMessageContext) ?? jumpToMessage;
}

interface JumpToMessageOptions {
  roomId: string | null;
  messageCount: number;
  hasMoreOlder: boolean;
  isLoadingOlder: boolean;
  loadOlderMessages: (limit?: number) => void;
  jump?: (messageId: string) => boolean;
}

interface PendingJump {
  messageId: string;
  pages: number;
}

export function useJumpToMessage({ roomId, messageCount, hasMoreOlder, isLoadingOlder, loadOlderMessages, jump = jumpToMessage }: JumpToMessageOptions): JumpToMessage {
  const pendingRef = useRef<PendingJump | null>(null);

  useEffect(() => {
    pendingRef.current = null;
  }, [roomId]);

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending || isLoadingOlder) {
      return;
    }
    if (jump(pending.messageId) || !hasMoreOlder || pending.pages >= MAX_JUMP_PAGES) {
      pendingRef.current = null;
      return;
    }
    pending.pages += 1;
    loadOlderMessages(JUMP_PAGE_SIZE);
  }, [messageCount, hasMoreOlder, isLoadingOlder, loadOlderMessages, jump]);

  return useCallback(
    (messageId: string) => {
      pendingRef.current = null;
      if (jump(messageId) || !hasMoreOlder) {
        return;
      }
      pendingRef.current = { messageId, pages: 1 };
      loadOlderMessages(JUMP_PAGE_SIZE);
    },
    [hasMoreOlder, loadOlderMessages, jump],
  );
}
