import { useEffect, useRef } from 'react';
import { useSocket, type RoomSummary } from '@lib/socket';
import { ASSISTANT_NICKNAME, isAssistantRoom } from '../utils/assistant';

export function useEnsureAssistantChat(rooms: RoomSummary[], isLoaded: boolean): void {
  const { socket } = useSocket();
  const hasRequestedRef = useRef(false);

  useEffect(() => {
    if (!socket || !isLoaded || hasRequestedRef.current) {
      return;
    }

    hasRequestedRef.current = true;

    if (!rooms.some(isAssistantRoom)) {
      socket.emit('room:create-private', { targetNickname: ASSISTANT_NICKNAME });
    }
  }, [socket, isLoaded, rooms]);
}
