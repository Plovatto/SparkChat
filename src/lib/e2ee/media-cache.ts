import { BoundedMap } from '@lib/cache/bounded-map';

const MAX_EXPIRED_MEDIA_URLS = 500;

const objectUrlsByKey = new Map<string, string>();
const pendingByKey = new Map<string, Promise<string>>();
const expiredMediaUrls = new BoundedMap<string, true>(MAX_EXPIRED_MEDIA_URLS);
let generation = 0;

export function markExpiredMediaUrl(content: string): void {
  expiredMediaUrls.set(content, true);
}

export function isExpiredMediaUrl(content: string | null | undefined): boolean {
  return Boolean(content) && expiredMediaUrls.has(content as string);
}

function cacheKeyOf(content: string, scope: string): string {
  return `${scope}\n${content}`;
}

export function resolveDecryptedMediaUrl(content: string, scope: string, decrypt: () => Promise<string | null>): Promise<string> {
  const key = cacheKeyOf(content, scope);
  const cached = objectUrlsByKey.get(key);
  if (cached) {
    return Promise.resolve(cached);
  }

  const pending = pendingByKey.get(key);
  if (pending) {
    return pending;
  }

  const taskGeneration = generation;
  const task = decrypt()
    .then((objectUrl) => {
      if (!objectUrl) {
        return content;
      }
      if (taskGeneration !== generation) {
        URL.revokeObjectURL(objectUrl);
        return content;
      }
      objectUrlsByKey.set(key, objectUrl);
      return objectUrl;
    })
    .finally(() => {
      if (pendingByKey.get(key) === task) {
        pendingByKey.delete(key);
      }
    });

  pendingByKey.set(key, task);
  return task;
}

export function getDecryptedMediaCacheSize(): number {
  return objectUrlsByKey.size;
}

export function clearDecryptedMediaCache(): void {
  generation += 1;
  pendingByKey.clear();
  expiredMediaUrls.clear();
  for (const objectUrl of objectUrlsByKey.values()) {
    URL.revokeObjectURL(objectUrl);
  }
  objectUrlsByKey.clear();
}
