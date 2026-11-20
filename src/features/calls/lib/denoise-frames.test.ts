import { describe, expect, it } from 'vitest';
import { DENOISE_FRAME_SIZE, FrameRing, GATE_DEFAULTS, VoiceGate } from './denoise-frames';

function ramp(start: number, length: number): Float32Array {
  return Float32Array.from({ length }, (_, index) => start + index);
}

describe('FrameRing', () => {
  it('groups 128-sample quanta into 480-sample frames with a fixed latency', () => {
    const frames: number[][] = [];
    const ring = new FrameRing(DENOISE_FRAME_SIZE, (frame) => frames.push([frame[0] ?? -1, frame[DENOISE_FRAME_SIZE - 1] ?? -1]));
    const output = new Float32Array(128);
    const collected: number[] = [];

    for (let block = 0; block < 15; block += 1) {
      ring.push(ramp(block * 128 + 1, 128), output);
      collected.push(...output);
    }

    expect(frames).toEqual([
      [1, 480],
      [481, 960],
      [961, 1440],
      [1441, 1920],
    ]);
    expect(ring.latency).toBe(479);
    expect(collected.slice(0, ring.latency).every((value) => value === 0)).toBe(true);
    expect(collected.slice(ring.latency, ring.latency + 5)).toEqual([1, 2, 3, 4, 5]);
    expect(collected.at(-1)).toBe(15 * 128 - ring.latency);
  });

  it('writes the processed samples back to the output', () => {
    const ring = new FrameRing(4, (frame) => frame.forEach((value, index) => (frame[index] = value * 10)), 2);
    const output = new Float32Array(2);
    const collected: number[] = [];

    for (let block = 0; block < 4; block += 1) {
      ring.push(ramp(block * 2 + 1, 2), output);
      collected.push(...output);
    }

    expect(collected).toEqual([0, 0, 0, 10, 20, 30, 40, 50]);
  });

  it('never allocates per block and can be reset', () => {
    let calls = 0;
    const ring = new FrameRing(4, () => (calls += 1), 2);
    const output = new Float32Array(2);
    ring.push(Float32Array.of(1, 2), output);
    ring.reset();
    ring.push(Float32Array.of(3, 4), output);
    ring.push(Float32Array.of(5, 6), output);

    expect(calls).toBe(1);
    expect(Array.from(output)).toEqual([0, 3]);
  });
});

describe('VoiceGate', () => {
  const frame = () => new Float32Array(DENOISE_FRAME_SIZE).fill(1);

  it('stays open while the voice probability is high', () => {
    const gate = new VoiceGate();
    const samples = frame();
    gate.process(samples, 0.9);

    expect(gate.open).toBe(true);
    expect(samples.at(-1)).toBeCloseTo(1, 5);
  });

  it('keeps word endings during the hangover before closing', () => {
    const gate = new VoiceGate();
    gate.process(frame(), 0.9);
    const holdFrames = Math.floor((GATE_DEFAULTS.holdMs / 1000) * GATE_DEFAULTS.sampleRate / DENOISE_FRAME_SIZE);

    for (let index = 0; index < holdFrames; index += 1) {
      gate.process(frame(), 0.1);
    }
    expect(gate.open).toBe(true);
    expect(gate.gain).toBeCloseTo(1, 5);

    gate.process(frame(), 0.1);
    expect(gate.open).toBe(false);
  });

  it('releases smoothly towards -30 dB between phrases', () => {
    const gate = new VoiceGate();
    for (let index = 0; index < 16; index += 1) {
      gate.process(frame(), 0);
    }
    const afterRelease = gate.gain;
    for (let index = 0; index < 200; index += 1) {
      gate.process(frame(), 0);
    }

    expect(afterRelease).toBeLessThan(1);
    expect(afterRelease).toBeGreaterThan(gate.floor);
    expect(gate.gain).toBeCloseTo(gate.floor, 3);
    expect(gate.floor).toBeCloseTo(Math.pow(10, -30 / 20), 6);
  });

  it('opens quickly when speech returns', () => {
    const gate = new VoiceGate();
    for (let index = 0; index < 300; index += 1) {
      gate.process(frame(), 0);
    }
    const samples = frame();
    gate.process(samples, 0.95);

    expect(gate.gain).toBeGreaterThan(0.85);
    expect(samples[240] ?? 0).toBeGreaterThan(0.6);
    gate.process(frame(), 0.95);
    expect(gate.gain).toBeGreaterThan(0.98);
  });

  it('ignores isolated voice-like spikes from clicks so the gate still closes', () => {
    const gate = new VoiceGate();
    for (let index = 0; index < 200; index += 1) {
      gate.process(frame(), index % 4 === 0 ? 0.6 : index % 4 === 1 ? 0.55 : 0.05);
    }

    expect(gate.open).toBe(false);
    expect(gate.gain).toBeLessThan(0.05);
  });

  it('opens on a sustained moderate voice probability', () => {
    const gate = new VoiceGate();
    for (let index = 0; index < 200; index += 1) {
      gate.process(frame(), 0);
    }
    gate.process(frame(), 0.6);
    gate.process(frame(), 0.6);
    expect(gate.open).toBe(false);
    gate.process(frame(), 0.6);
    expect(gate.open).toBe(true);
  });
});
