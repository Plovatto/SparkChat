export type LoadLevel = 0 | 1 | 2 | 3;
export type PressureState = 'nominal' | 'fair' | 'serious' | 'critical';

export interface LoadStatsSample {
  durations: Record<string, { cpu: number; total: number }>;
}

export interface LoadReading {
  cpuRatio: number;
  voiceJitterMs: number | null;
  sample: LoadStatsSample;
}

export interface LoadSample {
  cpuRatio: number;
  pressure: PressureState | null;
}

export interface LoadState {
  level: LoadLevel;
  hotTicks: number;
  calmSince: number | null;
}

export const LOAD_CALM: LoadState = { level: 0, hotTicks: 0, calmSince: null };
export const LOAD_HOT_RATIO = 0.3;
export const LOAD_COOL_RATIO = 0.05;
export const LOAD_HOT_TICKS = 2;
export const LOAD_RECOVER_MS = 20_000;
export const MAX_LOAD_LEVEL: LoadLevel = 3;

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function durationTotals(value: unknown): { cpu: number; total: number } | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  let total = 0;
  for (const amount of Object.values(value as Record<string, unknown>)) {
    total += finite(amount) ?? 0;
  }
  return { cpu: finite((value as Record<string, unknown>).cpu) ?? 0, total };
}

export function readLoad(report: RTCStatsReport, previous: LoadStatsSample | null): LoadReading {
  const durations: LoadStatsSample['durations'] = {};
  let cpuRatio = 0;
  let voiceJitterMs: number | null = null;
  report.forEach((entry: Record<string, unknown>) => {
    if (entry.type === 'outbound-rtp' && entry.kind === 'video') {
      const key = String(entry.mid ?? entry.id ?? '');
      const totals = durationTotals(entry.qualityLimitationDurations);
      if (!totals) {
        if (entry.qualityLimitationReason === 'cpu') {
          cpuRatio = 1;
        }
        return;
      }
      durations[key] = totals;
      const before = previous?.durations[key];
      const elapsed = before ? totals.total - before.total : 0;
      if (before && elapsed > 0) {
        cpuRatio = Math.max(cpuRatio, Math.min(1, Math.max(0, (totals.cpu - before.cpu) / elapsed)));
      }
    }
    if (entry.type === 'remote-inbound-rtp' && entry.kind === 'audio') {
      const jitter = finite(entry.jitter);
      if (jitter !== null) {
        voiceJitterMs = Math.max(voiceJitterMs ?? 0, jitter * 1000);
      }
    }
  });
  return { cpuRatio, voiceJitterMs, sample: { durations } };
}

function isHot(sample: LoadSample): boolean {
  return sample.cpuRatio >= LOAD_HOT_RATIO || sample.pressure === 'serious' || sample.pressure === 'critical';
}

function isCool(sample: LoadSample): boolean {
  return sample.cpuRatio < LOAD_COOL_RATIO && (sample.pressure === null || sample.pressure === 'nominal');
}

export function nextLoad(state: LoadState, sample: LoadSample, now: number): LoadState {
  if (isHot(sample)) {
    const hotTicks = state.hotTicks + 1;
    if (hotTicks >= LOAD_HOT_TICKS && state.level < MAX_LOAD_LEVEL) {
      return { level: (state.level + 1) as LoadLevel, hotTicks: 0, calmSince: null };
    }
    return { level: state.level, hotTicks, calmSince: null };
  }
  if (!isCool(sample)) {
    return { level: state.level, hotTicks: 0, calmSince: null };
  }
  const calmSince = state.calmSince ?? now;
  if (state.level > 0 && now - calmSince >= LOAD_RECOVER_MS) {
    return { level: (state.level - 1) as LoadLevel, hotTicks: 0, calmSince: now };
  }
  return { level: state.level, hotTicks: 0, calmSince };
}

export const SHARE_LOAD_FRAMERATE = [15, 8, 5, 3] as const;
export const SHARE_LOAD_BITRATE = [2_500_000, 1_800_000, 1_200_000, 800_000] as const;
export const SHARE_UNSTABLE_MAX_BITRATE = 1_000_000;
const SHARE_LOAD_BOX: ReadonlyArray<readonly [number, number]> = [
  [1920, 1080],
  [1920, 1080],
  [1280, 720],
  [1280, 720],
];

export interface ShareLoadInput {
  width: number | null;
  height: number | null;
  unstable: boolean;
}

export interface ShareLoadCap {
  maxBitrate: number;
  scaleResolutionDownBy: number;
  maxFramerate: number;
  degradationPreference: 'maintain-resolution' | 'balanced';
}

export function fitInside(width: number | null, height: number | null, maxWidth: number, maxHeight: number): number {
  if (!width || !height || width <= 0 || height <= 0) {
    return 1;
  }
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  const scale = Math.max(long / maxWidth, short / maxHeight, 1);
  return Math.round(scale * 1000) / 1000;
}

export function shareLoadCap(level: LoadLevel, { width, height, unstable }: ShareLoadInput): ShareLoadCap {
  const [maxWidth, maxHeight] = SHARE_LOAD_BOX[level] ?? [1280, 720];
  const bitrate = SHARE_LOAD_BITRATE[level];
  return {
    maxBitrate: unstable ? Math.min(bitrate, SHARE_UNSTABLE_MAX_BITRATE) : bitrate,
    scaleResolutionDownBy: fitInside(width, height, maxWidth, maxHeight),
    maxFramerate: SHARE_LOAD_FRAMERATE[level],
    degradationPreference: unstable ? 'balanced' : 'maintain-resolution',
  };
}

export interface CameraLoadCap {
  scaleResolutionDownBy: number;
  maxFramerate?: number;
}

const CAMERA_LOAD: ReadonlyArray<CameraLoadCap> = [{ scaleResolutionDownBy: 1 }, { scaleResolutionDownBy: 1.5, maxFramerate: 24 }, { scaleResolutionDownBy: 2, maxFramerate: 15 }, { scaleResolutionDownBy: 3, maxFramerate: 12 }];

export function cameraLoadCap(level: LoadLevel): CameraLoadCap {
  return { ...(CAMERA_LOAD[level] ?? CAMERA_LOAD[0] ?? { scaleResolutionDownBy: 1 }) };
}

export interface StrainSample {
  voiceJitterMs: number | null;
  pressure: PressureState | null;
  level: LoadLevel;
}

export interface StrainState {
  light: boolean;
  strainTicks: number;
  calmSince: number | null;
  recoverMs: number;
}

export const AUDIO_STRAIN_JITTER_MS = 30;
export const STRAIN_TICKS = 2;
export const STRAIN_RECOVER_MS = 60_000;
export const STRAIN_MAX_RECOVER_MS = 8 * STRAIN_RECOVER_MS;
export const STRAIN_CALM: StrainState = { light: false, strainTicks: 0, calmSince: null, recoverMs: STRAIN_RECOVER_MS };

function strained(sample: StrainSample): boolean {
  return (sample.voiceJitterMs !== null && sample.voiceJitterMs >= AUDIO_STRAIN_JITTER_MS) || sample.pressure === 'serious' || sample.level >= 2;
}

export function nextStrain(state: StrainState, sample: StrainSample, now: number): StrainState {
  if (sample.pressure === 'critical') {
    return { ...state, light: true, strainTicks: 0, calmSince: null };
  }
  if (strained(sample)) {
    if (state.light) {
      return { ...state, strainTicks: 0, calmSince: null };
    }
    const strainTicks = state.strainTicks + 1;
    return strainTicks >= STRAIN_TICKS ? { ...state, light: true, strainTicks: 0, calmSince: null } : { ...state, strainTicks };
  }
  if (!state.light) {
    return { ...state, strainTicks: 0 };
  }
  const calmSince = state.calmSince ?? now;
  if (now - calmSince >= state.recoverMs) {
    return { light: false, strainTicks: 0, calmSince: null, recoverMs: Math.min(STRAIN_MAX_RECOVER_MS, state.recoverMs * 2) };
  }
  return { ...state, strainTicks: 0, calmSince };
}

export interface FreezeSample {
  frames: number;
  packets: number;
}

export interface FreezeState {
  frames: number | null;
  packets: number | null;
  progressAt: number | null;
  requestedAt: number | null;
}

export const FREEZE_AFTER_MS = 4_000;
export const FREEZE_IDLE: FreezeState = { frames: null, packets: null, progressAt: null, requestedAt: null };

export function nextFreeze(state: FreezeState, sample: FreezeSample | null, now: number): FreezeState & { request: boolean } {
  if (!sample) {
    return { ...FREEZE_IDLE, request: false };
  }
  const decoded = state.frames === null || sample.frames > state.frames;
  const flowing = state.packets !== null && sample.packets > state.packets;
  if (decoded || !flowing) {
    return { frames: sample.frames, packets: sample.packets, progressAt: now, requestedAt: decoded ? null : state.requestedAt, request: false };
  }
  const progressAt = state.progressAt ?? now;
  const request = now - progressAt >= FREEZE_AFTER_MS && (state.requestedAt === null || now - state.requestedAt > FREEZE_AFTER_MS);
  return { frames: sample.frames, packets: sample.packets, progressAt, requestedAt: request ? now : state.requestedAt, request };
}

export function readShareFrames(report: RTCStatsReport, trackId: string | null): FreezeSample | null {
  if (!trackId) {
    return null;
  }
  let sample: FreezeSample | null = null;
  report.forEach((entry: Record<string, unknown>) => {
    if (entry.type === 'inbound-rtp' && entry.kind === 'video' && entry.trackIdentifier === trackId) {
      sample = { frames: finite(entry.framesDecoded) ?? 0, packets: finite(entry.packetsReceived) ?? 0 };
    }
  });
  return sample;
}

export interface LoadContext {
  pressure: PressureState | null;
  shareTrackId: string | null;
}

export interface LoadVerdict {
  level: LoadLevel;
  light: boolean;
  keyFrame: boolean;
}

export class LoadAdapter {
  private load: LoadState = LOAD_CALM;
  private sample: LoadStatsSample | null = null;
  private strain: StrainState = STRAIN_CALM;
  private freeze: FreezeState = FREEZE_IDLE;

  observe(report: RTCStatsReport, context: LoadContext, now: number): LoadVerdict {
    const reading = readLoad(report, this.sample);
    this.sample = reading.sample;
    this.load = nextLoad(this.load, { cpuRatio: reading.cpuRatio, pressure: context.pressure }, now);
    this.strain = nextStrain(this.strain, { voiceJitterMs: reading.voiceJitterMs, pressure: context.pressure, level: this.load.level }, now);
    const freeze = nextFreeze(this.freeze, readShareFrames(report, context.shareTrackId), now);
    this.freeze = { frames: freeze.frames, packets: freeze.packets, progressAt: freeze.progressAt, requestedAt: freeze.requestedAt };
    return { level: this.load.level, light: this.strain.light, keyFrame: freeze.request };
  }
}
