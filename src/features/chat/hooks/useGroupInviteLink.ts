import { useCallback, useEffect, useState } from 'react';
import {
  getGroupInviteLink,
  isGroupInviteAvailable,
  isGroupInviteCleared,
  resetGroupInvite,
  subscribeRoomInvite,
  subscribeRoomKeyAvailable,
} from '@lib/e2ee';
import { useSocket, type RoomSummary } from '@lib/socket';

export interface GroupInviteLinkState {
  isAvailable: boolean;
  isCleared: boolean;
  isResetting: boolean;
  createLink: () => Promise<string | null>;
  reset: () => Promise<boolean>;
}

export function useGroupInviteLink(room: RoomSummary): GroupInviteLinkState {
  const { socket } = useSocket();
  const [isAvailable, setIsAvailable] = useState(false);
  const [isCleared, setIsCleared] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const roomId = room.id;
  const isGroup = room.type === 'group';

  useEffect(() => {
    setIsAvailable(false);
    setIsCleared(false);
    if (!socket || !isGroup) {
      return;
    }
    let active = true;
    let version = 0;
    const load = () => {
      version += 1;
      const current = version;
      isGroupInviteAvailable(socket, roomId)
        .then((available) => {
          if (active && current === version) {
            setIsAvailable(available);
            setIsCleared(!available && isGroupInviteCleared(roomId));
          }
        })
        .catch(() => {
          if (active && current === version) {
            setIsAvailable(false);
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

  const createLink = useCallback(async () => {
    if (!socket || !isGroup) {
      return null;
    }
    try {
      return await getGroupInviteLink(socket, roomId, window.location.origin);
    } catch {
      return null;
    }
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

  return { isAvailable, isCleared, isResetting, createLink, reset };
}
