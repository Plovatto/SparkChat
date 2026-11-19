export type QualityBars = 1 | 2 | 3;

export const STATS_INTERVAL_MS = 2_000;

export interface QualitySample {
  packetsReceived: number;
  packetsLost: number;
}

export interface QualityReading {
  bars: QualityBars;
  sample: QualitySample;
  lossRatio: number;
  rttMs: number | null;
  jitterMs: number | null;
  outboundLoss: number;
}

export const UNSTABLE_LOSS_RATIO = 0.05;
export const UNSTABLE_AFTER_MS = 4_000;

export interface InstabilityState {
  unstable: boolean;
  highSince: number | null;
  lowSince: number | null;
}

export const STABLE: InstabilityState = { unstable: false, highSince: null, lowSince: null };

export function nextInstability(state: InstabilityState, lossRatio: number, now: number): InstabilityState {
  const windowStart = now - STATS_INTERVAL_MS;
  if (lossRatio > UNSTABLE_LOSS_RATIO) {
    const highSince = state.highSince ?? windowStart;
    return { unstable: state.unstable || now - highSince >= UNSTABLE_AFTER_MS, highSince, lowSince: null };
  }
  if (!state.unstable) {
    return STABLE;
  }
  const lowSince = state.lowSince ?? windowStart;
  return now - lowSince >= UNSTABLE_AFTER_MS ? STABLE : { unstable: true, highSince: null, lowSince };
}

function barsFor(value: number | null, good: number, fair: number): QualityBars {
  if (value === null || value < good) {
    return 3;
  }
  return value <= fair ? 2 : 1;
}

export function qualityBars(lossRatio: number, rttMs: number | null, jitterMs: number | null): QualityBars {
  const loss = barsFor(lossRatio * 100, 2, 5);
  const latency = barsFor(rttMs, 150, 300);
  const jitter = barsFor(jitterMs, 30, 50);
  return Math.min(loss, latency, jitter) as QualityBars;
}

export function readQuality(report: RTCStatsReport, previous: QualitySample | null): QualityReading {
  let packetsReceived = 0;
  let packetsLost = 0;
  let jitterMs: number | null = null;
  let rttMs: number | null = null;
  let outboundLoss = 0;

  report.forEach((entry: Record<string, unknown>) => {
    if (entry.type === 'inbound-rtp' && (entry.kind === 'audio' || entry.kind === 'video')) {
      packetsReceived += typeof entry.packetsReceived === 'number' ? entry.packetsReceived : 0;
      packetsLost += typeof entry.packetsLost === 'number' ? Math.max(0, entry.packetsLost) : 0;
      if (typeof entry.jitter === 'number') {
        jitterMs = Math.max(jitterMs ?? 0, entry.jitter * 1000);
      }
    }
    if (entry.type === 'remote-inbound-rtp' && typeof entry.fractionLost === 'number' && Number.isFinite(entry.fractionLost)) {
      outboundLoss = Math.max(outboundLoss, Math.min(1, Math.max(0, entry.fractionLost)));
    }
    if (entry.type === 'candidate-pair' && entry.nominated === true && typeof entry.currentRoundTripTime === 'number') {
      rttMs = entry.currentRoundTripTime * 1000;
    }
  });

  const sample: QualitySample = { packetsReceived, packetsLost };
  const receivedDelta = previous ? Math.max(0, packetsReceived - previous.packetsReceived) : packetsReceived;
  const lostDelta = previous ? Math.max(0, packetsLost - previous.packetsLost) : packetsLost;
  const total = receivedDelta + lostDelta;
  const lossRatio = total > 0 ? lostDelta / total : 0;
  return { bars: qualityBars(Math.max(lossRatio, outboundLoss), rttMs, jitterMs), sample, lossRatio, rttMs, jitterMs, outboundLoss };
}
