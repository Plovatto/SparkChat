import { useEffect, useState } from 'react';
import { canRenameGroup, subscribeRoomKeyAvailable } from '@lib/e2ee';
import { useSocket, type RoomSummary } from '@lib/socket';

export function useCanRenameGroup(room: RoomSummary): boolean {
  const { socket } = useSocket();
  const [canRename, setCanRename] = useState(false);

  useEffect(() => {
    if (!socket) {
      return;
    }
    let active = true;
    const refresh = () => {
      void canRenameGroup(socket, room.id).then((allowed) => {
        if (active) {
          setCanRename(allowed);
        }
      });
    };
    refresh();
    const unsubscribe = subscribeRoomKeyAvailable((roomId) => {
      if (roomId === room.id) {
        refresh();
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [socket, room.id, room.participants]);

  return canRename;
}
