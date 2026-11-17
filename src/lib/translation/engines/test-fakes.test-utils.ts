import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

export function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}

/** In-memory stand-in for the Cache API, keyed by URL. Test-only. */
export class FakeCacheStorage {
  readonly stores = new Map<string, Map<string, Uint8Array>>();
  readonly putUrls: string[] = [];

  open(name: string): Promise<Cache> {
    let store = this.stores.get(name);
    if (!store) {
      store = new Map();
      this.stores.set(name, store);
    }
    const entries = store;
    const putUrls = this.putUrls;
    const cache = {
      match: (request: RequestInfo | URL) => {
        const bytes = entries.get(urlOf(request));
        return Promise.resolve(bytes ? new Response(bytes.slice()) : undefined);
      },
      put: async (request: RequestInfo | URL, response: Response) => {
        entries.set(urlOf(request), new Uint8Array(await response.arrayBuffer()));
        putUrls.push(urlOf(request));
      },
      delete: (request: RequestInfo | URL) => Promise.resolve(entries.delete(urlOf(request))),
      keys: () => Promise.resolve([...entries.keys()].map((url) => ({ url }) as Request)),
    };
    return Promise.resolve(cache as unknown as Cache);
  }

  delete(name: string): Promise<boolean> {
    return Promise.resolve(this.stores.delete(name));
  }
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function gzip(text: string): Uint8Array {
  return new Uint8Array(gzipSync(Buffer.from(text, 'utf8')));
}

/** A body streamed in fixed-size chunks, so byte progress is observable. */
export function chunkedResponse(bytes: Uint8Array, chunkSize = 64 * 1024): Response {
  let offset = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
  return new Response(body, { status: 200 });
}
