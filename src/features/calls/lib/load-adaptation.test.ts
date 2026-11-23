import { describe, expect, it } from 'vitest';
import {
  AUDIO_STRAIN_JITTER_MS,
  cameraLoadCap,
  FREEZE_AFTER_MS,
  LOAD_CALM,
  LoadAdapter,
  LOAD_RECOVER_MS,
  nextFreeze,
  nextLoad,
  nextStrain,
  readLoad,
  readShareFrames,
  shareLoadCap,
  STRAIN_CALM,
  STRAIN_RECOVER_MS,
  type FreezeState,
  type LoadSample,
  type LoadState,
} from './load-adaptation';

function report(entries: Array<Record<string, unknown>>): RTCStatsReport {
  const map = new Map(entries.map((entry, index) => [String(entry.id ?? index), entry]));
  return map as unknown as RTCStatsReport;
}

function outbound(mid: string, cpu: number, total: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: `out-${mid}`, type: 'outbound-rtp', kind: 'video', mid, qualityLimitationDurations: { cpu, bandwidth: 0, other: 0, none: total - cpu }, ...extra };
}

describe('readLoad', () => {
  it('reports the share of time video was limited by the cpu since the previous sample', () => {
    const first = readLoad(report([outbound('1', 0, 10)]), null);
    const second = readLoad(report([outbound('1', 1.5, 12)]), first.sample);
    expect(second.cpuRatio).toBeCloseTo(0.75);
  });

  it('takes the worst sender when camera and share both send', () => {
    const first = readLoad(report([outbound('1', 0, 10), outbound('2', 0, 10)]), null);
    const second = readLoad(report([outbound('1', 0.2, 12), outbound('2', 1.8, 12)]), first.sample);
    expect(second.cpuRatio).toBeCloseTo(0.9);
  });

  it('counts nothing on the first sample or without video', () => {
    expect(readLoad(report([outbound('1', 5, 10)]), null).cpuRatio).toBe(0);
    expect(readLoad(report([]), null).cpuRatio).toBe(0);
  });

  it('falls back to the current limitation reason when durations are missing', () => {
    const entry = { id: 'o', type: 'outbound-rtp', kind: 'video', mid: '1', qualityLimitationReason: 'cpu' };
    expect(readLoad(report([entry]), null).cpuRatio).toBe(1);
  });

  it('reads the jitter the peer measures on our voice', () => {
    const entries = [
      { id: 'ra', type: 'remote-inbound-rtp', kind: 'audio', jitter: 0.045 },
      { id: 'rv', type: 'remote-inbound-rtp', kind: 'video', jitter: 0.2 },
    ];
    expect(readLoad(report(entries), null).voiceJitterMs).toBeCloseTo(45);
  });

  it('reports no voice jitter when the peer sent no report yet', () => {
    expect(readLoad(report([]), null).voiceJitterMs).toBeNull();
  });
});

describe('nextLoad', () => {
  const hot: LoadSample = { cpuRatio: 0.6, pressure: null };
  const cool: LoadSample = { cpuRatio: 0, pressure: null };

  it('steps down one level only after two hot samples in a row', () => {
    const once = nextLoad(LOAD_CALM, hot, 0);
    expect(once.level).toBe(0);
    const twice = nextLoad(once, hot, 2_000);
    expect(twice.level).toBe(1);
  });

  it('treats serious system pressure as hot even without video', () => {
    const sample: LoadSample = { cpuRatio: 0, pressure: 'serious' };
    expect(nextLoad(nextLoad(LOAD_CALM, sample, 0), sample, 2_000).level).toBe(1);
  });

  it('never goes past the lightest level', () => {
    let state = LOAD_CALM;
    for (let tick = 0; tick < 20; tick += 1) {
      state = nextLoad(state, hot, tick * 2_000);
    }
    expect(state.level).toBe(3);
  });

  it('recovers one level after a calm period and keeps recovering stepwise', () => {
    let state: LoadState = { ...LOAD_CALM, level: 2 };
    state = nextLoad(state, cool, 0);
    expect(state.level).toBe(2);
    state = nextLoad(state, cool, LOAD_RECOVER_MS - 1);
    expect(state.level).toBe(2);
    state = nextLoad(state, cool, LOAD_RECOVER_MS);
    expect(state.level).toBe(1);
    state = nextLoad(state, cool, LOAD_RECOVER_MS * 2);
    expect(state.level).toBe(0);
  });

  it('a hot sample resets the calm timer', () => {
    let state: LoadState = { ...LOAD_CALM, level: 1 };
    state = nextLoad(state, cool, 0);
    state = nextLoad(state, hot, LOAD_RECOVER_MS - 1_000);
    state = nextLoad(state, cool, LOAD_RECOVER_MS);
    expect(state.level).toBe(1);
  });

  it('holds the level on a moderate sample', () => {
    const moderate: LoadSample = { cpuRatio: 0.15, pressure: 'fair' };
    let state: LoadState = { ...LOAD_CALM, level: 1 };
    state = nextLoad(state, moderate, 0);
    state = nextLoad(state, moderate, LOAD_RECOVER_MS * 3);
    expect(state.level).toBe(1);
  });
});

describe('shareLoadCap', () => {
  it('caps a calm screen share to 1080p at 15 fps keeping detail', () => {
    const cap = shareLoadCap(0, { width: 2560, height: 1440, unstable: false });
    expect(cap.maxFramerate).toBe(15);
    expect(cap.scaleResolutionDownBy).toBeCloseTo(1.333, 2);
    expect(cap.degradationPreference).toBe('maintain-resolution');
  });

  it('keeps native size when the screen already fits', () => {
    expect(shareLoadCap(0, { width: 1920, height: 1080, unstable: false }).scaleResolutionDownBy).toBe(1);
    expect(shareLoadCap(0, { width: null, height: null, unstable: false }).scaleResolutionDownBy).toBe(1);
  });

  it('lowers frame rate first, then resolution, as load grows', () => {
    const size = { width: 1920, height: 1080, unstable: false };
    const levels = [0, 1, 2, 3].map((level) => shareLoadCap(level as 0 | 1 | 2 | 3, size));
    expect(levels.map((cap) => cap.maxFramerate)).toEqual([15, 8, 5, 3]);
    expect(levels[1]?.scaleResolutionDownBy).toBe(1);
    expect(levels[2]?.scaleResolutionDownBy).toBeCloseTo(1.5);
    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index]?.maxBitrate).toBeLessThan(levels[index - 1]?.maxBitrate ?? 0);
    }
  });

  it('balances frame rate and resolution on an unstable network so the share never stalls', () => {
    const cap = shareLoadCap(0, { width: 1920, height: 1080, unstable: true });
    expect(cap.degradationPreference).toBe('balanced');
    expect(cap.maxBitrate).toBeLessThanOrEqual(1_000_000);
  });
});

describe('cameraLoadCap', () => {
  it('keeps the camera untouched when calm', () => {
    expect(cameraLoadCap(0)).toEqual({ scaleResolutionDownBy: 1 });
  });

  it('shrinks resolution and frame rate as load grows', () => {
    expect(cameraLoadCap(1)).toEqual({ scaleResolutionDownBy: 1.5, maxFramerate: 24 });
    expect(cameraLoadCap(2)).toEqual({ scaleResolutionDownBy: 2, maxFramerate: 15 });
    expect(cameraLoadCap(3)).toEqual({ scaleResolutionDownBy: 3, maxFramerate: 12 });
  });
});

describe('nextStrain', () => {
  const strained = { voiceJitterMs: AUDIO_STRAIN_JITTER_MS + 5, pressure: null, level: 0 as const };
  const clean = { voiceJitterMs: 5, pressure: null, level: 0 as const };

  it('turns on light voice processing after two strained samples', () => {
    const once = nextStrain(STRAIN_CALM, strained, 0);
    expect(once.light).toBe(false);
    expect(nextStrain(once, strained, 2_000).light).toBe(true);
  });

  it('turns on immediately when the system reports critical pressure', () => {
    expect(nextStrain(STRAIN_CALM, { voiceJitterMs: null, pressure: 'critical', level: 0 }, 0).light).toBe(true);
  });

  it('turns on when video already had to drop to its lightest levels', () => {
    const heavy = { voiceJitterMs: null, pressure: null, level: 2 as const };
    expect(nextStrain(nextStrain(STRAIN_CALM, heavy, 0), heavy, 2_000).light).toBe(true);
  });

  it('restores full processing only after a long calm period', () => {
    let state = nextStrain(nextStrain(STRAIN_CALM, strained, 0), strained, 2_000);
    state = nextStrain(state, clean, 4_000);
    state = nextStrain(state, clean, 4_000 + STRAIN_RECOVER_MS - 1);
    expect(state.light).toBe(true);
    state = nextStrain(state, clean, 4_000 + STRAIN_RECOVER_MS);
    expect(state.light).toBe(false);
  });

  it('waits twice as long to restore after relapsing', () => {
    let state = nextStrain(nextStrain(STRAIN_CALM, strained, 0), strained, 2_000);
    state = nextStrain(state, clean, 4_000);
    state = nextStrain(state, clean, 4_000 + STRAIN_RECOVER_MS);
    expect(state.light).toBe(false);
    const relapse = 4_000 + STRAIN_RECOVER_MS + 2_000;
    state = nextStrain(nextStrain(state, strained, relapse), strained, relapse + 2_000);
    expect(state.light).toBe(true);
    state = nextStrain(state, clean, relapse + 4_000);
    state = nextStrain(state, clean, relapse + 4_000 + STRAIN_RECOVER_MS);
    expect(state.light).toBe(true);
    state = nextStrain(state, clean, relapse + 4_000 + STRAIN_RECOVER_MS * 2);
    expect(state.light).toBe(false);
  });

  it('ignores unknown jitter', () => {
    expect(nextStrain(nextStrain(STRAIN_CALM, clean, 0), { ...clean, voiceJitterMs: null }, 2_000).light).toBe(false);
  });
});

describe('nextFreeze', () => {
  const idle: FreezeState = { frames: null, packets: null, progressAt: null, requestedAt: null };

  it('asks for a fresh frame when packets keep arriving but no frame decodes', () => {
    let state = nextFreeze(idle, { frames: 100, packets: 1_000 }, 0);
    state = nextFreeze(state, { frames: 100, packets: 1_100 }, 2_000);
    expect(state.request).toBe(false);
    state = nextFreeze(state, { frames: 100, packets: 1_200 }, FREEZE_AFTER_MS);
    expect(state.request).toBe(true);
  });

  it('does not repeat the request before the back-off passes', () => {
    let state = nextFreeze(idle, { frames: 100, packets: 1_000 }, 0);
    state = nextFreeze(state, { frames: 100, packets: 1_100 }, FREEZE_AFTER_MS);
    expect(state.request).toBe(true);
    state = nextFreeze(state, { frames: 100, packets: 1_200 }, FREEZE_AFTER_MS + 1_000);
    expect(state.request).toBe(false);
    state = nextFreeze(state, { frames: 100, packets: 1_300 }, FREEZE_AFTER_MS * 2 + 1);
    expect(state.request).toBe(true);
  });

  it('treats a static screen without packets as idle, not frozen', () => {
    let state = nextFreeze(idle, { frames: 100, packets: 1_000 }, 0);
    state = nextFreeze(state, { frames: 100, packets: 1_000 }, FREEZE_AFTER_MS * 2);
    expect(state.request).toBe(false);
  });

  it('clears once frames decode again', () => {
    let state = nextFreeze(idle, { frames: 100, packets: 1_000 }, 0);
    state = nextFreeze(state, { frames: 100, packets: 1_100 }, 2_000);
    state = nextFreeze(state, { frames: 130, packets: 1_200 }, 4_000);
    expect(state.progressAt).toBe(4_000);
    state = nextFreeze(state, { frames: 130, packets: 1_300 }, 5_000);
    expect(state.request).toBe(false);
  });

  it('resets when the share stops', () => {
    const state = nextFreeze({ frames: 10, packets: 10, progressAt: 0, requestedAt: null }, null, 9_000);
    expect(state).toEqual({ ...idle, request: false });
  });
});

describe('readShareFrames', () => {
  it('reads decoded frames and packets of the shared screen only', () => {
    const entries = [
      { id: 'cam', type: 'inbound-rtp', kind: 'video', trackIdentifier: 'camera', framesDecoded: 5, packetsReceived: 50 },
      { id: 'scr', type: 'inbound-rtp', kind: 'video', trackIdentifier: 'screen', framesDecoded: 9, packetsReceived: 90 },
    ];
    expect(readShareFrames(report(entries), 'screen')).toEqual({ frames: 9, packets: 90 });
    expect(readShareFrames(report(entries), null)).toBeNull();
    expect(readShareFrames(report(entries), 'gone')).toBeNull();
  });
});

describe('LoadAdapter', () => {
  function tick(cpu: number, total: number, frames: number, packets: number, voiceJitter = 0.005): RTCStatsReport {
    return report([
      outbound('1', cpu, total),
      { id: 'ra', type: 'remote-inbound-rtp', kind: 'audio', jitter: voiceJitter },
      { id: 'scr', type: 'inbound-rtp', kind: 'video', trackIdentifier: 'screen', framesDecoded: frames, packetsReceived: packets },
    ]);
  }

  it('lowers video, lightens voice processing and recovers a frozen share from one stats report per tick', () => {
    const adapter = new LoadAdapter();
    const context = { pressure: null, shareTrackId: 'screen' };
    expect(adapter.observe(tick(0, 10, 10, 100), context, 0)).toEqual({ level: 0, light: false, keyFrame: false });
    expect(adapter.observe(tick(2, 12, 10, 150), context, 2_000).level).toBe(0);
    const third = adapter.observe(tick(4, 14, 10, 200), context, 4_000);
    expect(third.level).toBe(1);
    expect(third.keyFrame).toBe(true);
    adapter.observe(tick(6, 16, 20, 250), context, 6_000);
    const fifth = adapter.observe(tick(8, 18, 30, 300), context, 8_000);
    expect(fifth.level).toBe(2);
    expect(adapter.observe(tick(10, 20, 40, 350), context, 10_000).light).toBe(true);
  });
});
