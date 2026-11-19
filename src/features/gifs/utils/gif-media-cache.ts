import { BoundedMap } from '@lib/cache/bounded-map';
import { sniffGifMediaType, type GifMediaType } from '@lib/media/media-type';

export const GIF_MEDIA_CACHE_LIMIT = 200;

export interface GifMediaEntry {
  blob: Blob;
  objectUrl: string;
  mimeType: GifMediaType;
}

export type GifMediaLoader = (url: string) => Promise<Blob>;

interface ObjectUrlApi {
  create: (blob: Blob) => string;
  revoke: (url: string) => void;
}

const BROWSER_OBJECT_URLS: ObjectUrlApi = {
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => URL.revokeObjectURL(url),
};

export class GifMediaCache {
  private readonly entries: BoundedMap<string, GifMediaEntry>;
  private readonly pending = new Map<string, Promise<GifMediaEntry | null>>();
  private generation = 0;

  constructor(
    maxEntries: number = GIF_MEDIA_CACHE_LIMIT,
    private readonly objectUrls: ObjectUrlApi = BROWSER_OBJECT_URLS,
  ) {
    this.entries = new BoundedMap(maxEntries, (entry) => this.objectUrls.revoke(entry.objectUrl));
  }

  get size(): number {
    return this.entries.size;
  }

  peek(url: string): GifMediaEntry | undefined {
    return this.entries.get(url);
  }

  load(url: string, loader: GifMediaLoader): Promise<GifMediaEntry | null> {
    const cached = this.entries.get(url);
    if (cached) {
      return Promise.resolve(cached);
    }
    const inFlight = this.pending.get(url);
    if (inFlight) {
      return inFlight;
    }
    const taskGeneration = this.generation;
    const task = this.fetchEntry(url, loader)
      .then((entry) => {
        if (!entry) {
          return null;
        }
        if (taskGeneration !== this.generation) {
          this.objectUrls.revoke(entry.objectUrl);
          return null;
        }
        this.entries.set(url, entry);
        return entry;
      })
      .finally(() => {
        if (this.pending.get(url) === task) {
          this.pending.delete(url);
        }
      });
    this.pending.set(url, task);
    return task;
  }

  clear(): void {
    this.generation += 1;
    this.pending.clear();
    this.entries.clear();
  }

  private async fetchEntry(url: string, loader: GifMediaLoader): Promise<GifMediaEntry | null> {
    try {
      const fetched = await loader(url);
      const mimeType = sniffGifMediaType(new Uint8Array(await fetched.slice(0, 16).arrayBuffer()));
      if (!mimeType) {
        return null;
      }
      const blob = new Blob([fetched], { type: mimeType });
      return { blob, objectUrl: this.objectUrls.create(blob), mimeType };
    } catch {
      return null;
    }
  }
}

export const gifMediaCache = new GifMediaCache();

export function clearGifMediaCache(): void {
  gifMediaCache.clear();
}

export function takeLoadedGif(cache: GifMediaCache, url: string): Blob | null {
  return cache.peek(url)?.blob ?? null;
}
