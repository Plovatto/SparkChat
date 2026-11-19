import { useCallback, useEffect, useState } from 'react';
import { getGroupInviteLink, isGroupInviteCleared, resetGroupInvite, subscribeRoomInvite, subscribeRoomKeyAvailable } from '@lib/e2ee';
import { useSocket, type RoomSummary } from '@lib/socket';

export interface GroupInviteLinkState {
  link: string | null;
  isCleared: boolean;
  isResetting: boolean;
  reset: () => Promise<boolean>;
}

export function useGroupInviteLink(room: RoomSummary): GroupInviteLinkState {
  const { socket } = useSocket();
  const [link, setLink] = useState<string | null>(null);
  const [isCleared, setIsCleared] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const roomId = room.id;
  const isGroup = room.type === 'group';

  useEffect(() => {
    setLink(null);
    setIsCleared(false);
    if (!socket || !isGroup) {
      return;
    }
    let active = true;
    let version = 0;
    const load = () => {
      version += 1;
      const current = version;
      getGroupInviteLink(socket, roomId, window.location.origin)
        .then((value) => {
          if (active && current === version) {
            setLink(value);
            setIsCleared(value === null && isGroupInviteCleared(roomId));
          }
        })
        .catch(() => {
          if (active && current === version) {
            setLink(null);
          }
        });
    };
    const onChange = (changedRoomId: string) => {
      if (changedRoomId === roomId) {
        load();
      }
    };
    load();
    const unsubscribeInvite = subscribeRoomInvite(onChange);
    const unsubscribeKey = subscribeRoomKeyAvailable(onChange);
    return () => {
      active = false;
      unsubscribeInvite();
      unsubscribeKey();
    };
  }, [socket, roomId, isGroup]);

  const reset = useCallback(async () => {
    if (!socket || !isGroup) {
      return false;
    }
    setIsResetting(true);
    try {
      return await resetGroupInvite(socket, roomId);
    } catch {
      return false;
    } finally {
      setIsResetting(false);
    }
  }, [socket, roomId, isGroup]);

  return { link, isCleared, isResetting, reset };
}
