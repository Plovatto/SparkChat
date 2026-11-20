const STORAGE_PATH_PATTERN = /^\/uploads\/(images|audio|files)\/[^/]+$/;
const AVATAR_PATH_PATTERN = /^\/uploads\/avatars\/[^/]+$/;

export function configuredMediaOrigin(): string | null {
  const configured = import.meta.env.VITE_MEDIA_ORIGIN;
  if (!configured) {
    return null;
  }
  try {
    return new URL(configured).origin;
  } catch {
    return null;
  }
}

function matchesStorageUrl(value: string, pathPattern: RegExp, mediaOrigin: string | null): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || !pathPattern.test(url.pathname)) {
      return false;
    }
    return mediaOrigin === null || url.origin === mediaOrigin;
  } catch {
    return false;
  }
}

export function isStorageMediaUrl(value: string, mediaOrigin: string | null = configuredMediaOrigin()): boolean {
  return matchesStorageUrl(value, STORAGE_PATH_PATTERN, mediaOrigin);
}

export function isAvatarStorageUrl(value: string, mediaOrigin: string | null = configuredMediaOrigin()): boolean {
  return matchesStorageUrl(value, AVATAR_PATH_PATTERN, mediaOrigin);
}
