export const NOTIFICATION_ICON_CACHE_NAME = 'sparkchat-notification-icons';
export const NOTIFICATION_ICON_PATH_PREFIX = '/app/__notification-icon/';
export const NOTIFICATION_ICON_SIZE = 192;

export function notificationIconUrl(roomId: string): string {
  return `${NOTIFICATION_ICON_PATH_PREFIX}${encodeURIComponent(roomId)}`;
}

function cacheStorage(): CacheStorage | null {
  return typeof caches === 'undefined' ? null : caches;
}

export async function writeNotificationIcon(roomId: string, png: Blob): Promise<boolean> {
  const storage = cacheStorage();
  if (!storage) {
    return false;
  }
  try {
    const cache = await storage.open(NOTIFICATION_ICON_CACHE_NAME);
    await cache.put(notificationIconUrl(roomId), new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } }));
    return true;
  } catch {
    return false;
  }
}

export async function deleteNotificationIcon(roomId: string): Promise<boolean> {
  const storage = cacheStorage();
  if (!storage) {
    return false;
  }
  try {
    if (!(await storage.has(NOTIFICATION_ICON_CACHE_NAME))) {
      return false;
    }
    const cache = await storage.open(NOTIFICATION_ICON_CACHE_NAME);
    return await cache.delete(notificationIconUrl(roomId));
  } catch {
    return false;
  }
}

export async function clearNotificationIcons(): Promise<void> {
  const storage = cacheStorage();
  if (!storage) {
    return;
  }
  try {
    await storage.delete(NOTIFICATION_ICON_CACHE_NAME);
  } catch {
    return;
  }
}
