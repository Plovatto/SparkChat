export function useUserPhoto(userId: string | null | undefined): string | null {
  void userId;
  return null;
}

export function useRoomPhoto(roomId: string | null | undefined): string | null {
  void roomId;
  return null;
}

export function uploadMyPhoto(image: Blob): Promise<void> {
  void image;
  return Promise.reject(new Error('profile photos are not available yet'));
}

export function removeMyPhoto(): Promise<void> {
  return Promise.reject(new Error('profile photos are not available yet'));
}

export function uploadRoomPhoto(roomId: string, image: Blob): Promise<void> {
  void roomId;
  void image;
  return Promise.reject(new Error('profile photos are not available yet'));
}

export function removeRoomPhoto(roomId: string): Promise<void> {
  void roomId;
  return Promise.reject(new Error('profile photos are not available yet'));
}

export function queuePendingMyPhoto(image: Blob): void {
  void image;
}
