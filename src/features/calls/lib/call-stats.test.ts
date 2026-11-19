import { describe, expect, it } from 'vitest';
import { RELAY_UNKNOWN, STABLE, STATS_INTERVAL_MS, nextInstability, nextRelay, qualityBars, qualityTone, readQuality, selectedPairRelayed, type InstabilityState } from './call-stats';

function report(entries: Array<Record<string, unknown>>): RTCStatsReport {
  return new Map(entries.map((entry, index) => [String(index), entry]));
}

describe('qualityBars', () => {
  it('maps loss thresholds to 3, 2 and 1 bars', () => {
    expect(qualityBars(0.01, 50, 10)).toBe(3);
    expect(qualityBars(0.03, 50, 10)).toBe(2);
    expect(qualityBars(0.06, 50, 10)).toBe(1);
  });

  it('maps latency thresholds', () => {
    expect(qualityBars(0, 149, 10)).toBe(3);
    expect(qualityBars(0, 200, 10)).toBe(2);
    expect(qualityBars(0, 301, 10)).toBe(1);
  });

  it('maps jitter thresholds', () => {
    expect(qualityBars(0, 50, 29)).toBe(3);
    expect(qualityBars(0, 50, 40)).toBe(2);
    expect(qualityBars(0, 50, 60)).toBe(1);
  });

  it('uses the worst of the three and treats missing values as good', () => {
    expect(qualityBars(0.06, 10, 10)).toBe(1);
    expect(qualityBars(0, null, null)).toBe(3);
  });
});

describe('readQuality', () => {
  it('sums inbound audio and video, converts seconds to milliseconds and reads the nominated pair', () => {
    const reading = readQuality(
      report([
        { type: 'inbound-rtp', kind: 'audio', packetsReceived: 100, packetsLost: 0, jitter: 0.01 },
        { type: 'inbound-rtp', kind: 'video', packetsReceived: 200, packetsLost: 0, jitter: 0.02 },
        { type: 'candidate-pair', nominated: true, currentRoundTripTime: 0.12 },
        { type: 'candidate-pair', nominated: false, currentRoundTripTime: 5 },
      ]),
      null,
    );

    expect(reading.sample).toEqual({ packetsReceived: 300, packetsLost: 0 });
    expect(reading.jitterMs).toBeCloseTo(20);
    expect(reading.rttMs).toBeCloseTo(120);
    expect(reading.bars).toBe(3);
  });

  it('measures loss over the interval since the previous sample', () => {
    const reading = readQuality(
      report([{ type: 'inbound-rtp', kind: 'audio', packetsReceived: 1100, packetsLost: 100 }]),
      { packetsReceived: 1000, packetsLost: 0 },
    );

    expect(reading.lossRatio).toBeCloseTo(0.5);
    expect(reading.bars).toBe(1);
  });

  it('is safe on an empty report and on counters that went backwards', () => {
    expect(readQuality(report([]), null).bars).toBe(3);
    expect(readQuality(report([{ type: 'inbound-rtp', kind: 'audio', packetsReceived: 5, packetsLost: -1 }]), { packetsReceived: 50, packetsLost: 10 }).lossRatio).toBe(0);
  });
});

describe('outbound loss', () => {
  it('reads the loss the other side reports for what we send and uses it for the bars', () => {
    const reading = readQuality(report([
      { type: 'inbound-rtp', kind: 'audio', packetsReceived: 100, packetsLost: 0 },
      { type: 'remote-inbound-rtp', kind: 'video', fractionLost: 0.08 },
      { type: 'remote-inbound-rtp', kind: 'audio', fractionLost: 0.02 },
    ]), null);
    expect(reading.outboundLoss).toBe(0.08);
    expect(reading.lossRatio).toBe(0);
    expect(reading.bars).toBe(1);
  });

  it('ignores invalid fractions', () => {
    expect(readQuality(report([{ type: 'remote-inbound-rtp', fractionLost: Number.NaN }, { type: 'remote-inbound-rtp', fractionLost: -1 }]), null).outboundLoss).toBe(0);
  });
});

describe('instability detector', () => {
  function run(samples: number[]): boolean[] {
    let state: InstabilityState = STABLE;
    return samples.map((loss, index) => {
      state = nextInstability(state, loss, 10_000 + index * STATS_INTERVAL_MS);
      return state.unstable;
    });
  }

  it('turns unstable only when loss stays above 5% for 4 seconds', () => {
    expect(run([0.06])).toEqual([false]);
    expect(run([0.06, 0.07])).toEqual([false, true]);
    expect(run([0.06, 0.01, 0.06])).toEqual([false, false, false]);
    expect(run([0.05, 0.05, 0.05])).toEqual([false, false, false]);
  });

  it('recovers only after 4 seconds of low loss', () => {
    expect(run([0.1, 0.1, 0.01, 0.01, 0.1])).toEqual([false, true, true, false, false]);
    expect(run([0.1, 0.1, 0.01, 0.2, 0.01])).toEqual([false, true, true, true, true]);
  });
});

function statsMap(entries: Record<string, Record<string, unknown>>): RTCStatsReport {
  return new Map(Object.entries(entries));
}

describe('selectedPairRelayed', () => {
  const candidates = {
    lh: { type: 'local-candidate', candidateType: 'host' },
    lr: { type: 'local-candidate', candidateType: 'relay' },
    rh: { type: 'remote-candidate', candidateType: 'srflx' },
    rr: { type: 'remote-candidate', candidateType: 'relay' },
  };

  it('follows the transport selected candidate pair', () => {
    const report = statsMap({
      ...candidates,
      t: { type: 'transport', selectedCandidatePairId: 'p2' },
      p1: { type: 'candidate-pair', nominated: true, state: 'succeeded', localCandidateId: 'lh', remoteCandidateId: 'rh' },
      p2: { type: 'candidate-pair', nominated: true, state: 'succeeded', localCandidateId: 'lr', remoteCandidateId: 'rh' },
    });
    expect(selectedPairRelayed(report)).toBe(true);
  });

  it('treats a relayed remote side as relayed too', () => {
    const report = statsMap({ ...candidates, t: { type: 'transport', selectedCandidatePairId: 'p' }, p: { type: 'candidate-pair', localCandidateId: 'lh', remoteCandidateId: 'rr' } });
    expect(selectedPairRelayed(report)).toBe(true);
  });

  it('falls back to the nominated succeeded pair without a transport entry', () => {
    const direct = statsMap({ ...candidates, p: { type: 'candidate-pair', nominated: true, state: 'succeeded', localCandidateId: 'lh', remoteCandidateId: 'rh' } });
    expect(selectedPairRelayed(direct)).toBe(false);
    const waiting = statsMap({ ...candidates, p: { type: 'candidate-pair', nominated: true, state: 'in-progress', localCandidateId: 'lr', remoteCandidateId: 'rh' } });
    expect(selectedPairRelayed(waiting)).toBeNull();
  });

  it('returns null when the pair or its candidates are missing', () => {
    expect(selectedPairRelayed(statsMap({}))).toBeNull();
    expect(selectedPairRelayed(statsMap({ t: { type: 'transport', selectedCandidatePairId: 'gone' } }))).toBeNull();
    expect(selectedPairRelayed(statsMap({ p: { type: 'candidate-pair', nominated: true, state: 'succeeded', localCandidateId: 'x', remoteCandidateId: 'y' } }))).toBeNull();
  });
});

describe('relay hysteresis', () => {
  it('decides immediately the first time, then needs two equal readings to switch', () => {
    let state = nextRelay(RELAY_UNKNOWN, true);
    expect(state.relayed).toBe(true);
    state = nextRelay(state, false);
    expect(state.relayed).toBe(true);
    state = nextRelay(state, false);
    expect(state.relayed).toBe(false);
  });

  it('ignores a single different or missing sample', () => {
    let state = nextRelay(RELAY_UNKNOWN, false);
    state = nextRelay(state, true);
    state = nextRelay(state, false);
    state = nextRelay(state, null);
    state = nextRelay(state, true);
    expect(state.relayed).toBe(false);
    expect(nextRelay(RELAY_UNKNOWN, null)).toBe(RELAY_UNKNOWN);
  });
});

describe('qualityTone', () => {
  it('keeps the poor and fair colors and shows relay only when quality is good', () => {
    expect(qualityTone(1, true)).toBe('poor');
    expect(qualityTone(2, false)).toBe('fair');
    expect(qualityTone(3, true)).toBe('relay');
    expect(qualityTone(3, false)).toBe('good');
    expect(qualityTone(3, null)).toBe('good');
  });
});
