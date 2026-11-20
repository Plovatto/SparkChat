import { sniffGifMediaType, type GifMediaType } from '@lib/media/media-type';

export const GIF_MEDIA_CACHE_LIMIT = 200;
export const GIF_MEDIA_CACHE_MAX_BYTES = 60 * 1024 * 1024;

export interface GifMediaEntry {
  blob: Blob;
  mimeType: GifMediaType;
}

export type GifMediaLoader = (url: string) => Promise<Blob>;

export interface GifMediaCacheLimits {
  maxEntries?: number;
  maxBytes?: number;
}

export class GifMediaCache {
  private readonly entries = new Map<string, GifMediaEntry>();
  private readonly pending = new Map<string, Promise<GifMediaEntry | null>>();
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private totalBytes = 0;
  private generation = 0;

  constructor({ maxEntries = GIF_MEDIA_CACHE_LIMIT, maxBytes = GIF_MEDIA_CACHE_MAX_BYTES }: GifMediaCacheLimits = {}) {
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
  }

  get size(): number {
    return this.entries.size;
  }

  get bytes(): number {
    return this.totalBytes;
  }

  peek(url: string): GifMediaEntry | undefined {
    const entry = this.entries.get(url);
    if (entry) {
      this.entries.delete(url);
      this.entries.set(url, entry);
    }
    return entry;
  }

  load(url: string, loader: GifMediaLoader): Promise<GifMediaEntry | null> {
    const cached = this.peek(url);
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
        if (!entry || taskGeneration !== this.generation) {
          return null;
        }
        this.store(url, entry);
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
    this.totalBytes = 0;
  }

  private store(url: string, entry: GifMediaEntry): void {
    this.remove(url);
    this.entries.set(url, entry);
    this.totalBytes += entry.blob.size;
    while (this.entries.size > this.maxEntries || (this.totalBytes > this.maxBytes && this.entries.size > 1)) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.remove(oldest);
    }
  }

  private remove(url: string): void {
    const entry = this.entries.get(url);
    if (entry) {
      this.entries.delete(url);
      this.totalBytes -= entry.blob.size;
    }
  }

  private async fetchEntry(url: string, loader: GifMediaLoader): Promise<GifMediaEntry | null> {
    try {
      const fetched = await loader(url);
      const mimeType = sniffGifMediaType(new Uint8Array(await fetched.slice(0, 16).arrayBuffer()));
      if (!mimeType) {
        return null;
      }
      return { blob: new Blob([fetched], { type: mimeType }), mimeType };
    } catch {
      return null;
    }
  }
}

export const gifMediaCache = new GifMediaCache();

export function clearGifMediaCache(): void {
  gifMediaCache.clear();
}

export function pickDisplayedGif(displayed: GifMediaEntry | null, isShown: boolean): Blob | null {
  return displayed && isShown ? displayed.blob : null;
}
