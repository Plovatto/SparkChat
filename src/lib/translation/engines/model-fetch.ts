import type { PairKey } from '../types';

export const TRANSLATION_MODELS_CACHE = 'sparkchat-translation-models-v1';

export type BergamotRegistryKey = 'enpt' | 'pten';
export type BergamotModelPart = 'model' | 'lex' | 'vocab';
export type BergamotModelFile = {
  name: string;
  size: number;
  expectedSha256Hash: string;
  rawSize: number;
  rawSha256Hash: string;
};
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
    throw new Error(error instanceof OversizedBodyError ? 'integrity-failed' : 'download-failed', { cause: error });
  }
  const compressed = isGzipBytes(body);
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

export async function ensureModelFileCached(file: BergamotModelFile, onBytes: (n: number) => void, signal?: AbortSignal): Promise<void> {
  await cachedOrDownloaded(file, onBytes, signal, false);
}

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

export async function clearCachedModels(): Promise<void> {
  await caches.delete(TRANSLATION_MODELS_CACHE);
}
