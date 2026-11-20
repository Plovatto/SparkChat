import createRNNWasmModule from '@jitsi/rnnoise-wasm/dist/rnnoise.js';
import { DENOISE_FRAME_SIZE, FrameRing, PCM_SCALE, VoiceGate } from '../lib/denoise-frames';

declare const sampleRate: number;
declare function registerProcessor(name: string, processor: new (options: { processorOptions?: { wasm?: ArrayBuffer } }) => WorkletProcessor): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

interface WorkletProcessor extends AudioWorkletProcessor {
  process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean;
}

interface RnnoiseModule {
  HEAPF32: Float32Array;
  _malloc: (bytes: number) => number;
  _free: (pointer: number) => void;
  _rnnoise_create: (model: number) => number;
  _rnnoise_destroy: (state: number) => void;
  _rnnoise_process_frame: (state: number, output: number, input: number) => number;
}

class DenoiseProcessor extends AudioWorkletProcessor implements WorkletProcessor {
  private module: RnnoiseModule | null = null;
  private state = 0;
  private pointer = 0;
  private alive = true;
  private readonly gate = new VoiceGate({ sampleRate });
  private readonly ring = new FrameRing(DENOISE_FRAME_SIZE, (frame) => this.denoise(frame));

  constructor(options: { processorOptions?: { wasm?: ArrayBuffer } }) {
    super();
    const wasm = options.processorOptions?.wasm;
    this.port.onmessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data.type === 'stop') {
        this.stop();
      }
    };
    if (!wasm || sampleRate !== 48_000) {
      this.port.postMessage({ type: 'failed' });
      return;
    }
    void (createRNNWasmModule({ wasmBinary: wasm }) as Promise<RnnoiseModule>)
      .then((module) => {
        if (!this.alive) {
          return;
        }
        this.module = module;
        this.state = module._rnnoise_create(0);
        this.pointer = module._malloc(DENOISE_FRAME_SIZE * 4);
        this.port.postMessage({ type: 'ready' });
      })
      .catch(() => this.port.postMessage({ type: 'failed' }));
  }

  private denoise(frame: Float32Array): void {
    const module = this.module;
    if (!module || this.state === 0) {
      return;
    }
    const offset = this.pointer >> 2;
    const heap = module.HEAPF32;
    for (let index = 0; index < DENOISE_FRAME_SIZE; index += 1) {
      heap[offset + index] = (frame[index] ?? 0) * PCM_SCALE;
    }
    const vad = module._rnnoise_process_frame(this.state, this.pointer, this.pointer);
    const out = module.HEAPF32;
    for (let index = 0; index < DENOISE_FRAME_SIZE; index += 1) {
      frame[index] = (out[offset + index] ?? 0) / PCM_SCALE;
    }
    this.gate.process(frame, vad);
  }

  private stop(): void {
    this.alive = false;
    const module = this.module;
    if (module && this.state !== 0) {
      module._rnnoise_destroy(this.state);
      module._free(this.pointer);
    }
    this.state = 0;
    this.pointer = 0;
    this.module = null;
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!this.alive) {
      return false;
    }
    if (!output) {
      return true;
    }
    if (!input) {
      output.fill(0);
      return true;
    }
    if (!this.module) {
      output.set(input);
      return true;
    }
    this.ring.push(input, output);
    return true;
  }
}

registerProcessor('sc-denoise', DenoiseProcessor);
