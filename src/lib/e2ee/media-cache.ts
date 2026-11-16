const objectUrlsByContent = new Map<string, string>();
const pendingByContent = new Map<string, Promise<string>>();
let generation = 0;

export function resolveDecryptedMediaUrl(content: string, decrypt: () => Promise<string | null>): Promise<string> {
  const cached = objectUrlsByContent.get(content);
  if (cached) {
    return Promise.resolve(cached);
  }

  const pending = pendingByContent.get(content);
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
      objectUrlsByContent.set(content, objectUrl);
      return objectUrl;
    })
    .finally(() => {
      if (pendingByContent.get(content) === task) {
        pendingByContent.delete(content);
      }
    });

  pendingByContent.set(content, task);
  return task;
}

export function getDecryptedMediaCacheSize(): number {
  return objectUrlsByContent.size;
}

export function clearDecryptedMediaCache(): void {
  generation += 1;
  pendingByContent.clear();
  for (const objectUrl of objectUrlsByContent.values()) {
    URL.revokeObjectURL(objectUrl);
  }
  objectUrlsByContent.clear();
}
