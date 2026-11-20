export const DENOISE_SAMPLE_RATE = 48_000;
export const DENOISE_FRAME_SIZE = 480;
export const PCM_SCALE = 32_768;

export class FrameRing {
  private readonly frame: Float32Array;
  private readonly queue: Float32Array;
  private filled = 0;
  private readIndex = 0;
  private writeIndex = 0;
  private queued = 0;

  constructor(
    private readonly frameSize: number,
    private readonly process: (frame: Float32Array) => void,
    quantum = 128,
  ) {
    this.frame = new Float32Array(frameSize);
    this.queue = new Float32Array(frameSize + quantum * 2);
  }

  get latency(): number {
    return this.frameSize - 1;
  }

  push(input: Float32Array, output: Float32Array): void {
    const queue = this.queue;
    const capacity = queue.length;
    for (let index = 0; index < input.length; index += 1) {
      this.frame[this.filled] = input[index] ?? 0;
      this.filled += 1;
      if (this.filled === this.frameSize) {
        this.process(this.frame);
        for (let copy = 0; copy < this.frameSize; copy += 1) {
          queue[this.writeIndex] = this.frame[copy] ?? 0;
          this.writeIndex = (this.writeIndex + 1) % capacity;
        }
        this.queued = Math.min(capacity, this.queued + this.frameSize);
        this.filled = 0;
      }
      if (this.queued > 0) {
        output[index] = queue[this.readIndex] ?? 0;
        this.readIndex = (this.readIndex + 1) % capacity;
        this.queued -= 1;
      } else {
        output[index] = 0;
      }
    }
  }

  reset(): void {
    this.filled = 0;
    this.readIndex = 0;
    this.writeIndex = 0;
    this.queued = 0;
    this.frame.fill(0);
    this.queue.fill(0);
  }
}

export interface GateOptions {
  sampleRate: number;
  threshold: number;
  strongThreshold: number;
  confirmFrames: number;
  holdMs: number;
  floorDb: number;
  attackMs: number;
  releaseMs: number;
}

export const GATE_DEFAULTS: GateOptions = {
  sampleRate: DENOISE_SAMPLE_RATE,
  threshold: 0.5,
  strongThreshold: 0.8,
  confirmFrames: 3,
  holdMs: 150,
  floorDb: -30,
  attackMs: 5,
  releaseMs: 200,
};

function smoothing(ms: number, sampleRate: number): number {
  return ms <= 0 ? 0 : Math.exp(-1 / ((ms / 1000) * sampleRate));
}

export class VoiceGate {
  readonly floor: number;
  private readonly attack: number;
  private readonly release: number;
  private readonly holdSamples: number;
  private readonly threshold: number;
  private readonly strongThreshold: number;
  private readonly confirmFrames: number;
  private likelyFrames = 0;
  private quietSamples = 0;
  private target = 1;
  gain = 1;

  constructor(options: Partial<GateOptions> = {}) {
    const resolved = { ...GATE_DEFAULTS, ...options };
    this.floor = Math.pow(10, resolved.floorDb / 20);
    this.attack = smoothing(resolved.attackMs, resolved.sampleRate);
    this.release = smoothing(resolved.releaseMs, resolved.sampleRate);
    this.holdSamples = Math.round((resolved.holdMs / 1000) * resolved.sampleRate);
    this.threshold = resolved.threshold;
    this.strongThreshold = resolved.strongThreshold;
    this.confirmFrames = resolved.confirmFrames;
  }

  get open(): boolean {
    return this.target === 1;
  }

  process(frame: Float32Array, vad: number): void {
    this.likelyFrames = vad >= this.threshold ? this.likelyFrames + 1 : 0;
    if (vad >= this.strongThreshold || this.likelyFrames >= this.confirmFrames) {
      this.quietSamples = 0;
      this.target = 1;
    } else {
      this.quietSamples += frame.length;
      if (this.quietSamples > this.holdSamples) {
        this.target = this.floor;
      }
    }
    const target = this.target;
    const coefficient = target > this.gain ? this.attack : this.release;
    let gain = this.gain;
    for (let index = 0; index < frame.length; index += 1) {
      gain = target + (gain - target) * coefficient;
      frame[index] = (frame[index] ?? 0) * gain;
    }
    this.gain = gain;
  }
}
