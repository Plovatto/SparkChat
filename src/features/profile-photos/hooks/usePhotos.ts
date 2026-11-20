import { useEffect, useSyncExternalStore } from 'react';
import { getRoomPhotoUrl, getUserPhotoUrl, retainRoomPhoto, retainUserPhoto, subscribeProfilePhotos } from '@lib/e2ee';
import { startNotificationIconSync } from '../lib/notification-icon-sync';

function subscribe(onChange: () => void): () => void {
  return subscribeProfilePhotos(() => onChange());
}

export function useUserPhoto(userId: string | null | undefined): string | null {
  const readUser = () => getUserPhotoUrl(userId);
  const url = useSyncExternalStore(subscribe, readUser, readUser);
  useEffect(() => {
    if (!userId) {
      return;
    }
    startNotificationIconSync();
    return retainUserPhoto(userId);
  }, [userId]);
  return url;
}

export function useRoomPhoto(roomId: string | null | undefined): string | null {
  const readRoom = () => getRoomPhotoUrl(roomId);
  const url = useSyncExternalStore(subscribe, readRoom, readRoom);
  useEffect(() => {
    if (!roomId) {
      return;
    }
    startNotificationIconSync();
    return retainRoomPhoto(roomId);
  }, [roomId]);
  return url;
}
