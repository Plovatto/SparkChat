export function useUserPhoto(userId: string | null | undefined): string | null {
  void userId;
  return null;
}

export function useRoomPhoto(roomId: string | null | undefined): string | null {
  void roomId;
  return null;
}

export async function uploadMyPhoto(image: Blob): Promise<void> {
  void image;
  throw new Error('profile photos are not available yet');
}

export async function removeMyPhoto(): Promise<void> {
  throw new Error('profile photos are not available yet');
}

export async function uploadRoomPhoto(roomId: string, image: Blob): Promise<void> {
  void roomId;
  void image;
  throw new Error('profile photos are not available yet');
}

export async function removeRoomPhoto(roomId: string): Promise<void> {
  void roomId;
  throw new Error('profile photos are not available yet');
}

export function queuePendingMyPhoto(image: Blob): void {
  void image;
}
