const STORAGE_PATH_PATTERN = /^\/uploads\/(images|audio|files)\/[^/]+$/;

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

export function isStorageMediaUrl(value: string, mediaOrigin: string | null = configuredMediaOrigin()): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || !STORAGE_PATH_PATTERN.test(url.pathname)) {
      return false;
    }
    return mediaOrigin === null || url.origin === mediaOrigin;
  } catch {
    return false;
  }
}
