import type { PairKey } from '../types';

/** Holds only public model files (never message text). */
export const TRANSLATION_MODELS_CACHE = 'sparkchat-translation-models-v1';

export type BergamotRegistryKey = 'enpt' | 'pten';
export type BergamotModelPart = 'model' | 'lex' | 'vocab';
export type BergamotModelFile = { name: string; size: number; expectedSha256Hash: string };
/** Built from the pinned manifest (see model-registry.ts); `modelRegistry` resolves `name` to an absolute URL. */
export type BergamotRegistry = Record<BergamotRegistryKey, Record<BergamotModelPart, BergamotModelFile>>;

export function registryKeyOf(pair: PairKey): BergamotRegistryKey {
  return pair === 'en-pt' ? 'enpt' : 'pten';
}

function hexToBase64(hex: string): string {
  let binary = '';
  for (let index = 0; index < hex.length; index += 2) {
    binary += String.fromCharCode(parseInt(hex.slice(index, index + 2), 16));
  }
  return btoa(binary);
}

function bytesToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isGzip(url: string): boolean {
  return new URL(url).pathname.endsWith('.gz');
}

async function readCounting(body: ReadableStream<Uint8Array>, onBytes: (n: number) => void): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    length += value.byteLength;
    onBytes(value.byteLength);
  }
  const bytes = new Uint8Array(new ArrayBuffer(length));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Downloads with SRI and re-checks the sha256 before anything reaches the cache. */
async function download(url: string, sha256Hex: string, onBytes: (n: number) => void, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  let response: Response;
  try {
    response = await fetch(url, { integrity: `sha256-${hexToBase64(sha256Hex)}`, credentials: 'omit', signal });
  } catch {
    throw new Error('download-failed');
  }
  if (!response.ok || !response.body) {
    throw new Error('download-failed');
  }
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = await readCounting(response.body, onBytes);
  } catch {
    // An SRI mismatch also surfaces here, as a body error.
    throw new Error('download-failed');
  }
  if (bytesToHex(await crypto.subtle.digest('SHA-256', bytes)) !== sha256Hex) {
    throw new Error('integrity-failed');
  }
  return bytes;
}

async function cachedOrDownloaded(
  url: string,
  sha256Hex: string,
  onBytes: (n: number) => void,
  signal: AbortSignal | undefined,
  read: boolean,
): Promise<{ bytes: ArrayBuffer | null; fromCache: boolean; cache: Cache }> {
  const cache = await caches.open(TRANSLATION_MODELS_CACHE);
  const hit = await cache.match(url);
  if (hit) {
    return { bytes: read ? await hit.arrayBuffer() : null, fromCache: true, cache };
  }
  const bytes = await download(url, sha256Hex, onBytes, signal);
  await cache.put(url, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } }));
  return { bytes: bytes.buffer, fromCache: false, cache };
}

/** Makes sure the verified file is in the Cache API without reading it back. */
export async function ensureModelFileCached(
  url: string,
  sha256Hex: string,
  onBytes: (n: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  await cachedOrDownloaded(url, sha256Hex, onBytes, signal, false);
}

export async function fetchModelFile(
  url: string,
  sha256Hex: string,
  onBytes: (n: number) => void,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const { bytes, fromCache, cache } = await cachedOrDownloaded(url, sha256Hex, onBytes, signal, true);
  if (!bytes) {
    throw new Error('model-load-failed');
  }
  if (!isGzip(url)) {
    return bytes;
  }
  try {
    const stream = new Response(bytes).body!.pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).arrayBuffer();
  } catch {
    // A corrupt cache entry must not keep failing forever: drop it so the next prepare downloads it again.
    if (fromCache) {
      await cache.delete(url).catch(() => false);
    }
    throw new Error('model-load-failed');
  }
}

export async function hasCachedPair(pair: PairKey, registry: BergamotRegistry): Promise<boolean> {
  const cache = await caches.open(TRANSLATION_MODELS_CACHE);
  const files = Object.values(registry[registryKeyOf(pair)]);
  const hits = await Promise.all(files.map((file) => cache.match(file.name)));
  return hits.every((hit) => hit !== undefined);
}

/** Not wired to the UI on purpose; kept for support and future settings. */
export async function clearCachedModels(): Promise<void> {
  await caches.delete(TRANSLATION_MODELS_CACHE);
}
