import type { PairKey } from '../types';

/** Holds only public model files (never message text). */
export const TRANSLATION_MODELS_CACHE = 'sparkchat-translation-models-v1';

export type BergamotRegistryKey = 'enpt' | 'pten';
export type BergamotModelPart = 'model' | 'lex' | 'vocab';
/**
 * `size`/`expectedSha256Hash` describe the `.gz` file as published; `rawSize`/`rawSha256Hash` the decompressed
 * bytes, which is what arrives when the server sends the file with `Content-Encoding: gzip` and the browser decodes it.
 */
export type BergamotModelFile = {
  name: string;
  size: number;
  expectedSha256Hash: string;
  rawSize: number;
  rawSha256Hash: string;
};
/** Built from the pinned manifest (see model-registry.ts); `modelRegistry` resolves `name` to an absolute URL. */
export type BergamotRegistry = Record<BergamotRegistryKey, Record<BergamotModelPart, BergamotModelFile>>;

export function registryKeyOf(pair: PairKey): BergamotRegistryKey {
  return pair === 'en-pt' ? 'enpt' : 'pten';
}

function bytesToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return bytesToHex(await crypto.subtle.digest('SHA-256', bytes));
}

function isGzipBytes(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Response(bytes).body!.pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Thrown (and mapped to `integrity-failed`) when a body grows past what the pinned manifest allows. */
class OversizedBodyError extends Error {
  constructor() {
    super('integrity-failed');
  }
}

async function readCounting(
  body: ReadableStream<Uint8Array>,
  onBytes: (n: number) => void,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    length += value.byteLength;
    if (length > maxBytes) {
      // Neither form of a pinned file can be this large: stop reading instead of buffering it all.
      void reader.cancel().catch(() => undefined);
      throw new OversizedBodyError();
    }
    chunks.push(value);
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

/**
 * No `integrity` option: SRI hashes the bytes after any `Content-Encoding` decoding, so it fails on hosts that
 * serve `.gz` with `Content-Encoding: gzip` (Vite/sirv, some CDNs). Both forms are checked here against hashes
 * pinned in the bundle instead. Returns the verified decompressed bytes.
 */
async function download(file: BergamotModelFile, onBytes: (n: number) => void, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  let response: Response;
  try {
    response = await fetch(file.name, { credentials: 'omit', signal });
  } catch {
    throw new Error('download-failed');
  }
  if (!response.ok || !response.body) {
    throw new Error('download-failed');
  }
  // Progress counts against the compressed size; a decoded body is larger, so never report past it.
  let reported = 0;
  let body: Uint8Array<ArrayBuffer>;
  try {
    body = await readCounting(
      response.body,
      (n) => {
        const step = Math.min(n, file.size - reported);
        if (step > 0) {
          reported += step;
          onBytes(step);
        }
      },
      Math.max(file.size, file.rawSize),
    );
  } catch (error) {
    throw new Error(error instanceof OversizedBodyError ? 'integrity-failed' : 'download-failed');
  }
  const compressed = isGzipBytes(body);
  // A short body is a cut connection (network-class, retryable), not tampering.
  if (body.byteLength < (compressed ? file.size : file.rawSize)) {
    throw new Error('download-failed');
  }
  let raw = body;
  if (compressed) {
    if ((await sha256Hex(body)) !== file.expectedSha256Hash) {
      throw new Error('integrity-failed');
    }
    try {
      raw = await gunzip(body);
    } catch {
      throw new Error('integrity-failed');
    }
  }
  if (raw.byteLength !== file.rawSize || (await sha256Hex(raw)) !== file.rawSha256Hash) {
    throw new Error('integrity-failed');
  }
  if (reported < file.size) {
    onBytes(file.size - reported);
  }
  return raw;
}

/**
 * The cache keeps the verified decompressed bytes: one format whatever the host did, and no gunzip on load.
 * Entries are trusted on read (only verified bytes are ever put); a leftover compressed entry is dropped.
 */
async function cachedOrDownloaded(
  file: BergamotModelFile,
  onBytes: (n: number) => void,
  signal: AbortSignal | undefined,
  read: boolean,
): Promise<ArrayBuffer | null> {
  const cache = await caches.open(TRANSLATION_MODELS_CACHE);
  const hit = await cache.match(file.name);
  if (hit) {
    const bytes = await hit.arrayBuffer();
    if (bytes.byteLength === file.rawSize && !isGzipBytes(new Uint8Array(bytes, 0, 2))) {
      return read ? bytes : null;
    }
    await cache.delete(file.name).catch(() => false);
  }
  const raw = await download(file, onBytes, signal);
  await cache.put(file.name, new Response(raw, { headers: { 'Content-Type': 'application/octet-stream' } }));
  return raw.buffer;
}

/** Makes sure the verified file is in the Cache API. */
export async function ensureModelFileCached(file: BergamotModelFile, onBytes: (n: number) => void, signal?: AbortSignal): Promise<void> {
  await cachedOrDownloaded(file, onBytes, signal, false);
}

/** The verified, decompressed model file, from the Cache API or downloaded into it. */
export async function fetchModelFile(file: BergamotModelFile, onBytes: (n: number) => void, signal?: AbortSignal): Promise<ArrayBuffer> {
  const bytes = await cachedOrDownloaded(file, onBytes, signal, true);
  if (!bytes) {
    throw new Error('model-load-failed');
  }
  return bytes;
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
