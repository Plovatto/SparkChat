import { DENOISE_SAMPLE_RATE } from './denoise-frames';

export interface DenoiseNodeLike {
  connect: (node: never) => unknown;
  disconnect: () => void;
  port: { postMessage: (message: unknown) => void; onmessage: ((event: MessageEvent<{ type?: string }>) => void) | null };
}

export type DenoiseFactory = () => DenoiseNodeLike;

export interface DenoiseContextLike {
  sampleRate?: number;
  audioWorklet?: { addModule: (url: string) => Promise<void> };
}

export interface DenoiserDeps {
  workletUrl: () => Promise<string>;
  wasmBytes: () => Promise<ArrayBuffer>;
  createNode: (context: DenoiseContextLike, wasm: ArrayBuffer) => DenoiseNodeLike;
}

export function supportsAdvancedNoise(): boolean {
  if (typeof window === 'undefined' || typeof WebAssembly !== 'object') {
    return false;
  }
  const Context = window.AudioContext as (typeof AudioContext & { prototype: { audioWorklet?: unknown } }) | undefined;
  return typeof AudioWorkletNode === 'function' && Boolean(Context && 'audioWorklet' in Context.prototype);
}

let wasmPromise: Promise<ArrayBuffer> | null = null;

async function browserWasmBytes(): Promise<ArrayBuffer> {
  wasmPromise ??= import('@jitsi/rnnoise-wasm/dist/rnnoise.wasm?url')
    .then(({ default: url }) => fetch(url))
    .then((response) => {
      if (!response.ok) {
        throw new Error('wasm unavailable');
      }
      return response.arrayBuffer();
    })
    .catch((error: unknown) => {
      wasmPromise = null;
      throw error;
    });
  return wasmPromise;
}

async function browserWorkletUrl(): Promise<string> {
  const { default: url } = await import('../worklets/denoise.worklet.ts?worker&url');
  return url;
}

function browserCreateNode(context: DenoiseContextLike, wasm: ArrayBuffer): DenoiseNodeLike {
  return new AudioWorkletNode(context as unknown as BaseAudioContext, 'sc-denoise', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1,
    channelCountMode: 'explicit',
    outputChannelCount: [1],
    processorOptions: { wasm },
  });
}

const defaultDeps: DenoiserDeps = { workletUrl: browserWorkletUrl, wasmBytes: browserWasmBytes, createNode: browserCreateNode };

const prepared = new WeakMap<object, Promise<DenoiseFactory | null>>();

export function prepareDenoiser(context: DenoiseContextLike, deps: Partial<DenoiserDeps> = {}): Promise<DenoiseFactory | null> {
  const cached = prepared.get(context);
  if (cached) {
    return cached;
  }
  const resolved = { ...defaultDeps, ...deps };
  const worklet = context.audioWorklet;
  const promise =
    !worklet || context.sampleRate !== DENOISE_SAMPLE_RATE
      ? Promise.resolve(null)
      : Promise.all([resolved.workletUrl().then((url) => worklet.addModule(url)), resolved.wasmBytes()])
          .then(([, wasm]): DenoiseFactory => () => resolved.createNode(context, wasm))
          .catch(() => null);
  prepared.set(context, promise);
  return promise;
}
