export type QualityBars = 1 | 2 | 3;

export const STATS_INTERVAL_MS = 2_000;

export interface QualitySample {
  packetsReceived: number;
  packetsLost: number;
  pairId?: string;
  rttTotal?: number;
  rttResponses?: number;
  receiverReports?: Record<string, ReceiverReportMark>;
}

export interface ReceiverReportMark {
  lost: number | null;
  measurements: number | null;
  sent: number | null;
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

function selectedPair(report: RTCStatsReport): Record<string, unknown> | undefined {
  let pair: Record<string, unknown> | undefined;
  report.forEach((entry: Record<string, unknown>) => {
    if (!pair && entry.type === 'transport' && typeof entry.selectedCandidatePairId === 'string') {
      pair = report.get(entry.selectedCandidatePairId) as Record<string, unknown> | undefined;
    }
  });
  if (!pair) {
    report.forEach((entry: Record<string, unknown>) => {
      if (entry.type === 'candidate-pair' && entry.nominated === true && entry.state === 'succeeded' && (!pair || entry.selected === true)) {
        pair = entry;
      }
    });
  }
  return pair;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pairRoundTrip(pair: Record<string, unknown> | undefined, previous: QualitySample | null): { rttMs: number | null; sample: Pick<QualitySample, 'pairId' | 'rttTotal' | 'rttResponses'> } {
  if (!pair) {
    return { rttMs: null, sample: {} };
  }
  const pairId = typeof pair.id === 'string' ? pair.id : undefined;
  const total = finite(pair.totalRoundTripTime);
  const responses = finite(pair.responsesReceived);
  const current = finite(pair.currentRoundTripTime);
  const sample: Pick<QualitySample, 'pairId' | 'rttTotal' | 'rttResponses'> = {};
  if (pairId !== undefined) {
    sample.pairId = pairId;
  }
  if (total !== null && responses !== null) {
    sample.rttTotal = total;
    sample.rttResponses = responses;
  }
  const samePair = previous !== null && pairId !== undefined && previous.pairId === pairId;
  const newResponses = samePair && responses !== null && previous.rttResponses !== undefined ? responses - previous.rttResponses : 0;
  if (samePair && total !== null && previous.rttTotal !== undefined && newResponses > 0 && total >= previous.rttTotal) {
    return { rttMs: ((total - previous.rttTotal) / newResponses) * 1000, sample };
  }
  return { rttMs: current === null ? null : current * 1000, sample };
}

function receiverReportMark(report: RTCStatsReport, entry: Record<string, unknown>): ReceiverReportMark {
  const local = typeof entry.localId === 'string' ? (report.get(entry.localId) as Record<string, unknown> | undefined) : undefined;
  return { lost: finite(entry.packetsLost), measurements: finite(entry.roundTripTimeMeasurements), sent: finite(local?.packetsSent) };
}

function isFreshReceiverReport(mark: ReceiverReportMark, previous: ReceiverReportMark | undefined): boolean {
  if (!previous) {
    return true;
  }
  if (mark.sent !== null && previous.sent !== null && mark.sent === previous.sent) {
    return false;
  }
  const comparable = (mark.lost !== null && previous.lost !== null) || (mark.measurements !== null && previous.measurements !== null);
  return !comparable || mark.lost !== previous.lost || mark.measurements !== previous.measurements;
}

export function readQuality(report: RTCStatsReport, previous: QualitySample | null): QualityReading {
  let packetsReceived = 0;
  let packetsLost = 0;
  let jitterMs: number | null = null;
  let outboundLoss = 0;
  const receiverReports: Record<string, ReceiverReportMark> = {};

  report.forEach((entry: Record<string, unknown>) => {
    if (entry.type === 'inbound-rtp' && (entry.kind === 'audio' || entry.kind === 'video')) {
      packetsReceived += typeof entry.packetsReceived === 'number' ? entry.packetsReceived : 0;
      packetsLost += typeof entry.packetsLost === 'number' ? Math.max(0, entry.packetsLost) : 0;
      if (entry.kind === 'audio' && typeof entry.jitter === 'number') {
        jitterMs = Math.max(jitterMs ?? 0, entry.jitter * 1000);
      }
    }
    if (entry.type === 'remote-inbound-rtp' && typeof entry.fractionLost === 'number' && Number.isFinite(entry.fractionLost)) {
      const mark = receiverReportMark(report, entry);
      if (typeof entry.id === 'string') {
        receiverReports[entry.id] = mark;
      }
      if (isFreshReceiverReport(mark, typeof entry.id === 'string' ? previous?.receiverReports?.[entry.id] : undefined)) {
        outboundLoss = Math.max(outboundLoss, Math.min(1, Math.max(0, entry.fractionLost)));
      }
    }
  });

  const roundTrip = pairRoundTrip(selectedPair(report), previous);
  const rttMs = roundTrip.rttMs;
  const sample: QualitySample = { packetsReceived, packetsLost, ...roundTrip.sample, receiverReports };
  const receivedDelta = previous ? Math.max(0, packetsReceived - previous.packetsReceived) : packetsReceived;
  const lostDelta = previous ? Math.max(0, packetsLost - previous.packetsLost) : packetsLost;
  const total = receivedDelta + lostDelta;
  const lossRatio = total > 0 ? lostDelta / total : 0;
  return { bars: qualityBars(Math.max(lossRatio, outboundLoss), rttMs, jitterMs), sample, lossRatio, rttMs, jitterMs, outboundLoss };
}

export function selectedPairRelayed(report: RTCStatsReport): boolean | null {
  const pair = selectedPair(report);
  if (!pair) {
    return null;
  }
  const local = report.get(String(pair.localCandidateId)) as Record<string, unknown> | undefined;
  const remote = report.get(String(pair.remoteCandidateId)) as Record<string, unknown> | undefined;
  if (!local && !remote) {
    return null;
  }
  return local?.candidateType === 'relay' || remote?.candidateType === 'relay';
}

export interface RelayState {
  relayed: boolean | null;
  pending: boolean | null;
}

export const RELAY_UNKNOWN: RelayState = { relayed: null, pending: null };

export function nextRelay(state: RelayState, reading: boolean | null): RelayState {
  if (reading === null) {
    return state;
  }
  if (state.relayed === null) {
    return { relayed: reading, pending: null };
  }
  if (reading === state.relayed) {
    return state.pending === null ? state : { relayed: state.relayed, pending: null };
  }
  if (state.pending === reading) {
    return { relayed: reading, pending: null };
  }
  return { relayed: state.relayed, pending: reading };
}

export type QualityTone = 'good' | 'relay' | 'fair' | 'poor';

export function qualityTone(bars: QualityBars, relayed: boolean | null): QualityTone {
  if (bars === 1) {
    return 'poor';
  }
  if (bars === 2) {
    return 'fair';
  }
  return relayed === true ? 'relay' : 'good';
}
