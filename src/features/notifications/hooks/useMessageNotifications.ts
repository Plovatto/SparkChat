import { useEffect, useRef } from 'react';
import { useSocket, type MessageView, type RoomSummary } from '@lib/socket';
import { buildNotificationContent } from '../utils/build-notification-content';
import { playNotificationSound } from '../utils/play-notification-sound';

export function useMessageNotifications(
  rooms: RoomSummary[],
  currentUserId: string | undefined,
  selectedRoomId: string | null,
  mutedRoomIds: Set<string>,
  isNotificationEnabled: boolean,
  isSoundEnabled: boolean,
  onNotificationClick: (roomId: string) => void,
): void {
  const { socket } = useSocket();
  const roomsRef = useRef(rooms);
  roomsRef.current = rooms;
  const mutedRoomIdsRef = useRef(mutedRoomIds);
  mutedRoomIdsRef.current = mutedRoomIds;
  const selectedRoomIdRef = useRef(selectedRoomId);
  selectedRoomIdRef.current = selectedRoomId;

  useEffect(() => {
    if (!socket || (!isNotificationEnabled && !isSoundEnabled)) {
      return;
    }

    const handleMessageNew = (message: MessageView) => {
      if (message.sender.id === currentUserId || message.type === 'system') {
        return;
      }

      const isActivelyViewingRoom =
        document.hasFocus() && document.visibilityState === 'visible' && selectedRoomIdRef.current === message.roomId;
      if (isActivelyViewingRoom || mutedRoomIdsRef.current.has(message.roomId)) {
        return;
      }

      if (isSoundEnabled) {
        playNotificationSound();
      }

      if (!isNotificationEnabled) {
        return;
      }

      const room = roomsRef.current.find((candidate) => candidate.id === message.roomId);
      if (!room) {
        return;
      }

      void buildNotificationContent(message, room).then(({ title, body, icon, image }) => {
        const options: NotificationOptions & { renotify?: boolean; image?: string } = {
          body,
          tag: message.roomId,
          renotify: true,
          icon,
          silent: true,
          ...(image ? { image } : {}),
        };
        const notification = new Notification(title, options);
        notification.onclick = () => {
          window.focus();
          onNotificationClick(message.roomId);
          notification.close();
        };
      });
    };

    socket.on('message:new', handleMessageNew);
    return () => {
      socket.off('message:new', handleMessageNew);
    };
  }, [socket, isNotificationEnabled, isSoundEnabled, currentUserId, onNotificationClick]);
}
