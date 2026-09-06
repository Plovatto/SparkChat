import { BoundedMap } from '@lib/cache/bounded-map';

const MAX_DECRYPTED_MEDIA = 400;

const objectUrlsByContent = new BoundedMap<string, string>(MAX_DECRYPTED_MEDIA, (objectUrl) => URL.revokeObjectURL(objectUrl));
const pendingByContent = new Map<string, Promise<string>>();

export function resolveDecryptedMediaUrl(content: string, decrypt: () => Promise<string | null>): Promise<string> {
  const cached = objectUrlsByContent.get(content);
  if (cached) {
    return Promise.resolve(cached);
  }

  const pending = pendingByContent.get(content);
  if (pending) {
    return pending;
  }

  const task = decrypt()
    .then((objectUrl) => {
      if (!objectUrl) {
        return content;
      }
      objectUrlsByContent.set(content, objectUrl);
      return objectUrl;
    })
    .finally(() => {
      pendingByContent.delete(content);
    });

  pendingByContent.set(content, task);
  return task;
}

export function clearDecryptedMediaCache(): void {
  pendingByContent.clear();
  objectUrlsByContent.clear();
}
