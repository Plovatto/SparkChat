import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { RoomParticipant } from '@lib/socket';
import type { ChatMessage } from '../../types';
import { MediaViewer } from '../lazy-panels';
import { MediaViewerContext } from './media-viewer-context';
import { toMediaViewerItems } from './media-viewer-items';

interface MediaViewerProviderProps {
  messages: readonly ChatMessage[];
  participants: readonly RoomParticipant[];
  roomName?: string;
  onForward?: (messageId: string) => void;
  onShowInChat?: (messageId: string) => void;
  children: ReactNode;
}

export function MediaViewerProvider({ messages, participants, roomName, onForward, onShowInChat, children }: MediaViewerProviderProps) {
  const items = useMemo(() => toMediaViewerItems(messages, participants), [messages, participants]);
  const [openId, setOpenId] = useState<string | null>(null);
  const startIndex = openId ? Math.max(0, items.findIndex((item) => item.id === openId)) : 0;

  const open = useCallback(
    (messageId: string) => {
      if (!items.some((item) => item.id === messageId)) {
        return false;
      }
      setOpenId(messageId);
      return true;
    },
    [items],
  );

  const api = useMemo(() => ({ open }), [open]);
  const close = useCallback(() => setOpenId(null), []);

  return (
    <MediaViewerContext.Provider value={api}>
      {children}
      <MediaViewer
        isOpen={openId !== null}
        items={items}
        startIndex={startIndex}
        onClose={close}
        roomName={roomName}
        onForward={
          onForward
            ? (messageId) => {
                close();
                onForward(messageId);
              }
            : undefined
        }
        onShowInChat={
          onShowInChat
            ? (messageId) => {
                close();
                onShowInChat(messageId);
              }
            : undefined
        }
      />
    </MediaViewerContext.Provider>
  );
}
