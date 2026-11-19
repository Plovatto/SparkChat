import { describe, expect, it } from 'vitest';
import { qualityBars, readQuality } from './call-stats';

function report(entries: Array<Record<string, unknown>>): RTCStatsReport {
  return new Map(entries.map((entry, index) => [String(index), entry])) as unknown as RTCStatsReport;
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
