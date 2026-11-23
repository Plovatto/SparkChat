import type { CallKind, CallRole, SignalType } from '@lib/e2ee/call-crypto';
import type { ShareSurfaceKind } from './share-surface';

export type DegradeStep = 'video-360' | 'audio-only-relay';

export type ControlMessage = { t: 'hangup' } | { t: 'ping' } | { t: 'mute'; on: boolean } | { t: 'camera'; on: boolean } | ScreenControl | { t: 'caps'; screen: boolean };

export type RestartReason = 'connect-timeout' | 'disconnected' | 'failed' | 'retry' | 'online' | 'resync' | 'probe';

export const INITIAL_RELAY_FALLBACK_MS = 8_000;
export const DIRECT_RESTART_ATTEMPTS = 2;
export const FAILED_RELAY_AFTER_MS = 10_000;
export const RESTART_RETRY_MS: readonly number[] = [3_000, 5_000, 8_000, 13_000, 15_000];
export const RELAY_PROBE_INTERVAL_MS = 60_000;
export const KEEPALIVE_INTERVAL_MS = 5_000;
export const MAX_RELAY_PROBES = 3;
export const RELAY_PROBE_SLOW_INTERVAL_MS = 5 * 60_000;

export function isRelayUrl(url: string): boolean {
  return /^turns?:/i.test(url);
}

export function directServers(servers: readonly RTCIceServer[]): RTCIceServer[] {
  const result: RTCIceServer[] = [];
  for (const server of servers) {
    const urls = (Array.isArray(server.urls) ? server.urls : [server.urls]).filter((url) => !isRelayUrl(url));
    if (urls.length > 0) {
      result.push({ ...server, urls });
    }
  }
  return result;
}

export function hasRelay(servers: readonly RTCIceServer[]): boolean {
  return servers.some((server) => (Array.isArray(server.urls) ? server.urls : [server.urls]).some(isRelayUrl));
}

export function restartUsesRelay(attempt: number, failingSince: number | null, now: number): boolean {
  return attempt >= DIRECT_RESTART_ATTEMPTS || (failingSince !== null && now - failingSince >= FAILED_RELAY_AFTER_MS);
}

export function retryDelay(attempt: number): number {
  return RESTART_RETRY_MS[Math.min(Math.max(attempt - 1, 0), RESTART_RETRY_MS.length - 1)] ?? 15_000;
}

export interface ScreenInfo {
  surface: ShareSurfaceKind;
  label: string | null;
  audio?: boolean;
  movie?: boolean;
  paused?: boolean;
}

export interface ScreenControl {
  t: 'screen';
  on: boolean;
  surface?: ShareSurfaceKind;
  label?: string;
  audio?: boolean;
  movie?: boolean;
  paused?: boolean;
}

export const MAX_SCREEN_LABEL_LENGTH = 80;
const SURFACES: ReadonlySet<string> = new Set(['browser', 'window', 'monitor', 'unknown']);
const UNSAFE_CHAR = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

function isUnsafeChar(char: string): boolean {
  return UNSAFE_CHAR.test(char);
}

export function sanitizeScreenLabel(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const visible = Array.from(value).filter((char) => !isUnsafeChar(char)).join('').trim();
  const clean = Array.from(visible).slice(0, MAX_SCREEN_LABEL_LENGTH).join('').trim();
  return clean === '' ? null : clean;
}

export function screenControl(on: boolean, info: ScreenInfo | null = null): ScreenControl {
  const message: ScreenControl = { t: 'screen', on };
  if (!on || !info) {
    return message;
  }
  message.surface = SURFACES.has(info.surface) ? info.surface : 'unknown';
  if (info.audio !== undefined) {
    message.audio = info.audio;
  }
  if (info.movie !== undefined) {
    message.movie = info.movie;
  }
  if (info.paused !== undefined) {
    message.paused = info.paused;
  }
  let label = sanitizeScreenLabel(info.label);
  while (label && JSON.stringify({ ...message, label }).length > MAX_CONTROL_LENGTH) {
    label = sanitizeScreenLabel(Array.from(label).slice(0, -8).join(''));
  }
  if (label) {
    message.label = label;
  }
  return message;
}

export type ConnectionStatus = 'connected' | 'interrupted';

export const CONTROL_CHANNEL_LABEL = 'control';
export const CONTROL_CHANNEL_ID = 0;
export const DISCONNECTED_RESTART_DELAY_MS = 2_500;
export const CONNECT_RESTART_DELAY_MS = 20_000;
export const CREDENTIAL_REFRESH_MS = 40 * 60 * 1000;
export const AUDIO_MAX_BITRATE = 32_000;
export const VIDEO_MAX_BITRATE = 1_500_000;
export const VIDEO_DEGRADED_MAX_BITRATE = 600_000;
export const VIDEO_UNSTABLE_MAX_BITRATE = 350_000;
export const VIDEO_MIN_ADAPTIVE_BITRATE = 150_000;
const UPLINK_CHANGE_RATIO = 0.2;
export const SCREEN_MAX_BITRATE = 2_500_000;
export const SCREEN_DEGRADED_MAX_BITRATE = 1_000_000;
export const SCREEN_AUDIO_MAX_BITRATE = 64_000;
export const MOVIE_AUDIO_MAX_BITRATE = 192_000;
export const MOVIE_4K_MAX_BITRATE = 20_000_000;
export const MOVIE_1440_MAX_BITRATE = 12_000_000;
export const MOVIE_1080_MAX_BITRATE = 8_000_000;
export const MOVIE_RELAY_MAX_BITRATE = 4_000_000;
export const MOVIE_HIGH_FRAMERATE = 60;
export const MOVIE_DEGRADED_MAX_BITRATE = 1_500_000;
export const MOVIE_MAX_FRAMERATE = 30;

export interface ScreenEncodingInput {
  movie: boolean;
  relayed: boolean;
  degrade: DegradeStep | null;
  width: number | null;
  height: number | null;
  frameRate?: number | null;
  uplinkBps?: number | null;
}

export interface ScreenEncoding {
  maxBitrate: number;
  scaleResolutionDownBy: number;
  maxFramerate?: number;
  degradationPreference: 'maintain-framerate' | 'maintain-resolution';
}

function fitScale(width: number | null, height: number | null, maxWidth: number, maxHeight: number): number {
  if (!width || !height || width <= 0 || height <= 0) {
    return 1;
  }
  const scale = Math.max(width / maxWidth, height / maxHeight, 1);
  return Math.round(scale * 1000) / 1000;
}

export function directMovieBitrate(width: number | null, height: number | null): number {
  const lines = Math.min(width ?? 0, height ?? 0) > 0 ? Math.min(Math.max(width ?? 0, height ?? 0) * 9 / 16, Math.min(width ?? 0, height ?? 0)) : 0;
  if (lines >= 2000) {
    return MOVIE_4K_MAX_BITRATE;
  }
  if (lines >= 1400) {
    return MOVIE_1440_MAX_BITRATE;
  }
  return MOVIE_1080_MAX_BITRATE;
}

export function screenEncoding({ movie, relayed, degrade, width, height, frameRate = null, uplinkBps = null }: ScreenEncodingInput): ScreenEncoding {
  const degraded = degrade === 'video-360';
  if (!movie) {
    return { maxBitrate: degraded ? SCREEN_DEGRADED_MAX_BITRATE : SCREEN_MAX_BITRATE, scaleResolutionDownBy: 1, degradationPreference: 'maintain-resolution' };
  }
  if (degraded) {
    return { maxBitrate: MOVIE_DEGRADED_MAX_BITRATE, scaleResolutionDownBy: fitScale(width, height, 1280, 720), maxFramerate: MOVIE_MAX_FRAMERATE, degradationPreference: 'maintain-framerate' };
  }
  if (relayed) {
    return { maxBitrate: MOVIE_RELAY_MAX_BITRATE, scaleResolutionDownBy: fitScale(width, height, 1920, 1080), maxFramerate: MOVIE_MAX_FRAMERATE, degradationPreference: 'maintain-framerate' };
  }
  const maxBitrate = directMovieBitrate(width, height);
  const highFrameRate = (frameRate ?? 0) >= 50 && uplinkBps !== null && uplinkBps >= maxBitrate;
  return { maxBitrate, scaleResolutionDownBy: 1, maxFramerate: highFrameRate ? MOVIE_HIGH_FRAMERATE : MOVIE_MAX_FRAMERATE, degradationPreference: 'maintain-framerate' };
}

const STEREO_PARAMS = ['stereo=1', 'sprop-stereo=1', `maxaveragebitrate=${MOVIE_AUDIO_MAX_BITRATE}`, 'cbr=0', 'usedtx=0'];
const VOICE_PARAMS = ['useinbandfec=1', 'usedtx=0', `maxaveragebitrate=${AUDIO_MAX_BITRATE}`];

function paramKey(part: string): string {
  return part.split('=')[0] ?? part;
}

function tuneOpusSection(section: string, params: readonly string[], override: boolean): string {
  const payload = /a=rtpmap:(\d+) opus\/48000\/2/i.exec(section)?.[1];
  if (!payload) {
    return section;
  }
  const fmtp = new RegExp(`(a=fmtp:${payload} )([^\r\n]*)`);
  const match = fmtp.exec(section);
  if (!match) {
    const eol = section.includes('\r\n') ? '\r\n' : '\n';
    return section.replace(new RegExp(`(a=rtpmap:${payload} [^\r\n]*)`), `$1${eol}a=fmtp:${payload} ${params.join(';')}`);
  }
  const wanted = new Map(params.map((part) => [paramKey(part), part]));
  const existing = (match[2] ?? '').split(';').map((part) => part.trim()).filter(Boolean);
  const keys = new Set(existing.map(paramKey));
  const kept = override ? existing.map((part) => wanted.get(paramKey(part)) ?? part) : existing;
  const merged = [...kept, ...params.filter((part) => !keys.has(paramKey(part)))].join(';');
  return section.replace(fmtp, `$1${merged}`);
}

export function tuneAudioSdp(sdp: string): string {
  const sections = sdp.split(/(?=\nm=)/);
  let audioIndex = 0;
  return sections
    .map((section) => {
      if (!/^\n?m=audio /.test(section)) {
        return section;
      }
      audioIndex += 1;
      if (audioIndex === 1) {
        return tuneOpusSection(section, VOICE_PARAMS, true);
      }
      if (audioIndex === 2) {
        return tuneOpusSection(section, STEREO_PARAMS, false);
      }
      return section;
    })
    .join('');
}
export const MAX_REMOTE_CANDIDATES = 200;
export const DTLS_VERIFY_TIMEOUT_MS = 10_000;
const MAX_SDP_LENGTH = 14_000;
const MAX_CANDIDATE_LENGTH = 2_048;
const MAX_CONTROL_LENGTH = 256;
const MAX_FINGERPRINTS = 4;
const MIN_RESTART_GAP_MS = 1_000;
const FINGERPRINT_PATTERN = /^[a-z0-9-]+ (?:[0-9A-Fa-f]{2}:)*[0-9A-Fa-f]{2}$/;
const SDP_FINGERPRINT = /^a=fingerprint:(\S+) (\S+)\s*$/gm;

export interface PeerSessionDeps {
  createConnection: (config: RTCConfiguration) => RTCPeerConnection;
  hashCertificate: (certificate: ArrayBuffer) => Promise<string>;
  createStream: () => MediaStream;
  now: () => number;
  codecCapabilities: (kind: 'audio' | 'video') => RTCRtpCodec[];
}

export interface IceRefresh {
  iceServers: RTCIceServer[];
  degrade?: DegradeStep | null;
}

export interface PeerSessionOptions {
  role: CallRole;
  kind: CallKind;
  mobile: boolean;
  iceServers: RTCIceServer[];
  degrade?: DegradeStep | null;
  localStream: MediaStream | null;
  sendSignal: (type: SignalType, payload: Record<string, unknown>) => void;
  refreshIceServers?: () => Promise<IceRefresh | null>;
  onConnection: (status: ConnectionStatus) => void;
  onFatal: (detail: string) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onRemoteScreen?: (stream: MediaStream) => void;
  onControl: (message: ControlMessage) => void;
  onDegrade?: (step: DegradeStep | null) => void;
  onRestart?: (reason: RestartReason, relay: boolean) => void;
  canProbeDirect?: () => boolean;
  deps?: Partial<PeerSessionDeps>;
}

export function defaultHashCertificate(certificate: ArrayBuffer): Promise<string> {
  return crypto.subtle.digest('SHA-256', certificate).then((digest) =>
    Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(':'),
  );
}

function defaultDeps(): PeerSessionDeps {
  return {
    createConnection: (config) => new RTCPeerConnection(config),
    hashCertificate: defaultHashCertificate,
    createStream: () => new MediaStream(),
    now: () => Date.now(),
    codecCapabilities: (kind) => {
      try {
        return typeof RTCRtpReceiver !== 'undefined' && typeof RTCRtpReceiver.getCapabilities === 'function' ? (RTCRtpReceiver.getCapabilities(kind)?.codecs ?? []) : [];
      } catch {
        return [];
      }
    },
  };
}

function mimeOf(codec: RTCRtpCodec): string {
  return codec.mimeType.toLowerCase();
}

export function preferredAudioCodecs(codecs: readonly RTCRtpCodec[]): RTCRtpCodec[] {
  const red = codecs.filter((codec) => mimeOf(codec) === 'audio/red');
  const opus = codecs.filter((codec) => mimeOf(codec) === 'audio/opus');
  if (opus.length === 0) {
    return [];
  }
  const rest = codecs.filter((codec) => !red.includes(codec) && !opus.includes(codec));
  return [...red, ...opus, ...rest];
}

export function screenAudioCodecs(codecs: readonly RTCRtpCodec[]): RTCRtpCodec[] {
  return codecs.filter((codec) => mimeOf(codec) === 'audio/opus');
}

function isCompactScreenCodec(codec: RTCRtpCodec): boolean {
  const mime = mimeOf(codec);
  const fmtp = (codec.sdpFmtpLine ?? '').toLowerCase();
  if (mime === 'video/vp8') {
    return true;
  }
  if (mime === 'video/vp9') {
    return fmtp === '' || fmtp.includes('profile-id=0');
  }
  if (mime === 'video/h264') {
    return fmtp.includes('packetization-mode=1') && fmtp.includes('profile-level-id=42e01f');
  }
  return false;
}

const SCREEN_CODEC_ORDER = ['video/vp9', 'video/av1', 'video/vp8', 'video/h264'];

function isScreenAv1(codec: RTCRtpCodec): boolean {
  return mimeOf(codec) === 'video/av1';
}

export function screenVideoCodecs(codecs: readonly RTCRtpCodec[]): RTCRtpCodec[] {
  const primary = codecs.filter((codec) => isCompactScreenCodec(codec) || isScreenAv1(codec));
  if (primary.filter((codec) => !isScreenAv1(codec)).length === 0) {
    return [];
  }
  const ordered = [...primary].sort((a, b) => SCREEN_CODEC_ORDER.indexOf(mimeOf(a)) - SCREEN_CODEC_ORDER.indexOf(mimeOf(b)));
  return [...ordered, ...codecs.filter((codec) => mimeOf(codec) === 'video/rtx')];
}

export function extractSdpFingerprints(sdp: string): string[] {
  const found = new Set<string>();
  for (const match of sdp.matchAll(SDP_FINGERPRINT)) {
    found.add(`${(match[1] ?? '').toLowerCase()} ${(match[2] ?? '').toUpperCase()}`);
  }
  return Array.from(found);
}

export function parseControlMessage(raw: unknown): ControlMessage | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_CONTROL_LENGTH) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const message = parsed as Record<string, unknown>;
    if (message.t === 'hangup') {
      return { t: 'hangup' };
    }
    if (message.t === 'ping') {
      return { t: 'ping' };
    }
    if (message.t === 'caps' && typeof message.screen === 'boolean') {
      return { t: 'caps', screen: message.screen };
    }
    if (message.t === 'screen' && typeof message.on === 'boolean') {
      const screen: ScreenControl = { t: 'screen', on: message.on };
      if (message.on && typeof message.surface === 'string' && SURFACES.has(message.surface)) {
        screen.surface = message.surface as ShareSurfaceKind;
      }
      if (message.on && typeof message.audio === 'boolean') {
        screen.audio = message.audio;
      }
      if (message.on && typeof message.movie === 'boolean') {
        screen.movie = message.movie;
      }
      if (message.on && typeof message.paused === 'boolean') {
        screen.paused = message.paused;
      }
      const label = message.on ? sanitizeScreenLabel(message.label) : null;
      if (label) {
        screen.label = label;
      }
      return screen;
    }
    if ((message.t === 'mute' || message.t === 'camera') && typeof message.on === 'boolean') {
      return { t: message.t, on: message.on };
    }
    return null;
  } catch {
    return null;
  }
}

function isDescription(value: unknown, type: 'offer' | 'answer'): value is RTCSessionDescriptionInit {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const description = value as Record<string, unknown>;
  return description.type === type && typeof description.sdp === 'string' && description.sdp.length > 0 && description.sdp.length <= MAX_SDP_LENGTH;
}

function parseFingerprints(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_FINGERPRINTS) {
    return null;
  }
  const normalized: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !FINGERPRINT_PATTERN.test(entry)) {
      return null;
    }
    const [algorithm = '', hex = ''] = entry.split(' ');
    normalized.push(`${algorithm.toLowerCase()} ${hex.toUpperCase()}`);
  }
  return normalized;
}

export interface SenderCap {
  maxBitrate: number;
  scaleResolutionDownBy?: number;
  maxFramerate?: number;
  priority?: RTCPriorityType;
  degradationPreference?: 'maintain-framerate' | 'maintain-resolution' | 'balanced';
}

type ExtendedEncoding = RTCRtpEncodingParameters & { priority?: RTCPriorityType; networkPriority?: RTCPriorityType };

export function senderParameters(current: RTCRtpSendParameters, cap: SenderCap, extended: boolean): RTCRtpSendParameters {
  const encodings: ExtendedEncoding[] = current.encodings?.length ? current.encodings.map((encoding) => ({ ...encoding })) : [{}];
  const first: ExtendedEncoding = encodings[0] ?? {};
  first.maxBitrate = cap.maxBitrate;
  if (cap.scaleResolutionDownBy !== undefined) {
    first.scaleResolutionDownBy = cap.scaleResolutionDownBy;
  }
  if (cap.maxFramerate !== undefined) {
    first.maxFramerate = cap.maxFramerate;
  } else {
    delete first.maxFramerate;
  }
  if (extended && cap.priority) {
    first.priority = cap.priority;
    first.networkPriority = cap.priority;
  }
  encodings[0] = first;
  const next = { ...current, encodings } as RTCRtpSendParameters & { degradationPreference?: string };
  if (extended && cap.degradationPreference) {
    next.degradationPreference = cap.degradationPreference;
  }
  return next;
}

const EARLY_STATE_CONTROLS: ReadonlySet<ControlMessage['t']> = new Set(['caps', 'camera', 'mute', 'screen']);

export class PeerSession {
  private readonly options: PeerSessionOptions;
  private readonly deps: PeerSessionDeps;
  private readonly polite: boolean;
  private readonly connection: RTCPeerConnection;
  private control: RTCDataChannel | null = null;
  private queue: Promise<void> = Promise.resolve();
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private receivedCandidates = 0;
  private makingOffer = false;
  private ignoreOffer = false;
  private closed = false;
  private connected = false;
  private dtlsChecked = false;
  private watchedTransport: RTCDtlsTransport | null = null;
  private verified = false;
  private pendingRemoteStreams = new Map<string, MediaStream>();
  private dtlsTimer: ReturnType<typeof setTimeout> | null = null;
  private remoteFingerprints: string[] = [];
  private lastRestartAt = -Infinity;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private fallbackStream: MediaStream | null = null;
  private degrade: DegradeStep | null;
  private localAttached = false;
  private pendingVideoTrack: MediaStreamTrack | null | undefined = undefined;
  private earlyControls = new Map<ControlMessage['t'], ControlMessage>();
  private remoteScreen: MediaStream | null = null;
  private remoteScreenExposed = false;
  private unstable = false;
  private movie = false;
  private peerScreenCaps = false;
  private allServers: RTCIceServer[];
  private relayEnabled = false;
  private attempt = 0;
  private failingSince: number | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private probeTimer: ReturnType<typeof setInterval> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private probePending = false;
  private probeFailures = 0;
  private probeInterval = 0;
  private relayCredentialsDropped = false;
  private relayRefresh: Promise<void> | null = null;
  private uplinkBps: number | null = null;
  private reportedDegrade: DegradeStep | null = null;

  constructor(options: PeerSessionOptions) {
    this.options = options;
    this.deps = { ...defaultDeps(), ...options.deps };
    this.polite = options.role === 'callee';
    this.degrade = options.degrade ?? null;
    this.allServers = [...options.iceServers];
    this.connection = this.deps.createConnection({
      iceServers: directServers(options.iceServers),
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: 1,
      iceTransportPolicy: 'all',
    });
    this.bind();
  }

  private bind(): void {
    const connection = this.connection;
    connection.onicecandidate = (event) => this.handleLocalCandidate(event.candidate);
    connection.onnegotiationneeded = () => {
      void this.negotiate();
    };
    connection.oniceconnectionstatechange = () => this.handleIceState();
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'connected') {
        this.verifyDtls();
      }
    };
    connection.ontrack = (event) => this.handleTrack(event);
  }

  start(): void {
    this.connectTimer = setTimeout(() => {
      this.connectTimer = null;
      if (!this.connected) {
        this.recover('connect-timeout', hasRelay(this.allServers));
      }
    }, INITIAL_RELAY_FALLBACK_MS);
    this.scheduleCredentialRefresh();
    if (this.polite) {
      return;
    }
    this.openControlChannel();
    const init: RTCRtpTransceiverInit = { direction: 'sendrecv' };
    this.connection.addTransceiver('audio', init);
    this.connection.addTransceiver('video', init);
    this.connection.addTransceiver('video', init);
    this.connection.addTransceiver('audio', init);
    this.applyCodecPreferences();
  }

  private applyCodecPreferences(): void {
    const audio = this.deps.codecCapabilities('audio');
    const video = this.deps.codecCapabilities('video');
    this.preferCodecs(this.transceiversOf('audio')[0], preferredAudioCodecs(audio));
    this.preferCodecs(this.screenTransceiver(), screenVideoCodecs(video));
    this.preferCodecs(this.screenAudioTransceiver(), screenAudioCodecs(audio));
  }

  private preferCodecs(transceiver: RTCRtpTransceiver | undefined, codecs: RTCRtpCodec[]): void {
    if (!transceiver || codecs.length === 0 || typeof transceiver.setCodecPreferences !== 'function') {
      return;
    }
    try {
      transceiver.setCodecPreferences(codecs);
    } catch {
      return;
    }
  }

  receiveSignal(type: SignalType, payload: Record<string, unknown>): Promise<void> {
    this.queue = this.queue.then(() => this.process(type, payload)).catch(() => undefined);
    return this.queue;
  }

  private async process(type: SignalType, payload: Record<string, unknown>): Promise<void> {
    if (this.closed) {
      return;
    }
    switch (type) {
      case 'offer':
      case 'answer':
        await this.handleDescription(type, payload);
        return;
      case 'candidate':
        await this.handleRemoteCandidate(payload.candidate);
        return;
      case 'end-of-candidates':
      case 'ice-restart':
        return;
    }
  }

  private async handleDescription(type: 'offer' | 'answer', payload: Record<string, unknown>): Promise<void> {
    const description = payload.description;
    const fingerprints = parseFingerprints(payload.fingerprints);
    if (!isDescription(description, type) || !fingerprints) {
      this.fatal('invalid-description');
      return;
    }
    const inSdp = extractSdpFingerprints(description.sdp ?? '');
    if (!fingerprints.every((fingerprint) => inSdp.includes(fingerprint))) {
      this.fatal('fingerprint-mismatch');
      return;
    }
    const connection = this.connection;
    const collision = type === 'offer' && (this.makingOffer || connection.signalingState !== 'stable');
    this.ignoreOffer = !this.polite && collision;
    if (this.ignoreOffer) {
      return;
    }
    this.remoteFingerprints = fingerprints;
    this.dtlsChecked = false;
    await connection.setRemoteDescription(description);
    await this.flushCandidates();
    if (type === 'offer') {
      if (this.polite && !this.control) {
        this.openControlChannel();
      }
      for (const transceiver of connection.getTransceivers()) {
        transceiver.direction = 'sendrecv';
      }
      if (this.polite) {
        this.applyCodecPreferences();
      }
      await this.setLocal('answer');
      this.sendDescription('answer');
    }
    this.verifyDtls();
  }

  private async attachLocalTracks(): Promise<void> {
    const stream = this.options.localStream;
    if (this.localAttached || !stream) {
      return;
    }
    this.localAttached = true;
    for (const track of stream.getTracks()) {
      if (track.readyState === 'ended' || (track.kind === 'video' && this.pendingVideoTrack !== undefined)) {
        continue;
      }
      const transceiver = this.connection.getTransceivers().find((candidate) => (candidate.receiver.track?.kind ?? candidate.sender.track?.kind) === track.kind);
      if (transceiver && !(await this.replaceWithRetry(transceiver.sender, track))) {
        this.fatal('media-attach-failed');
        return;
      }
    }
    const pendingVideo = this.pendingVideoTrack;
    this.pendingVideoTrack = undefined;
    const camera = this.cameraTransceiver();
    if (pendingVideo !== undefined && camera) {
      await camera.sender.replaceTrack(pendingVideo).catch(() => undefined);
    }
    await this.applyCaps();
    this.announceMedia();
  }

  private async replaceWithRetry(sender: RTCRtpSender, track: MediaStreamTrack): Promise<boolean> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await sender.replaceTrack(track);
        return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  private async setLocal(kind: 'offer' | 'answer', options?: RTCOfferOptions): Promise<void> {
    const connection = this.connection;
    if (!(kind === 'offer' ? 'createOffer' in connection : 'createAnswer' in connection)) {
      await connection.setLocalDescription();
      return;
    }
    const description = kind === 'offer' ? await connection.createOffer(options) : await connection.createAnswer();
    const original = description.sdp ?? '';
    const tuned = tuneAudioSdp(original);
    try {
      await connection.setLocalDescription({ type: description.type, sdp: tuned });
    } catch (error) {
      if (tuned === original) {
        throw error;
      }
      await connection.setLocalDescription({ type: description.type, sdp: original });
    }
  }

  private async negotiate(): Promise<void> {
    if (this.closed || (this.polite && !this.connection.remoteDescription)) {
      return;
    }
    try {
      this.makingOffer = true;
      await this.setLocal('offer');
      this.sendDescription('offer');
    } catch {
      return;
    } finally {
      this.makingOffer = false;
    }
  }

  private sendDescription(type: 'offer' | 'answer'): void {
    const description = this.connection.localDescription;
    if (!description || this.closed) {
      return;
    }
    this.options.sendSignal(type, {
      description: { type: description.type, sdp: description.sdp },
      fingerprints: extractSdpFingerprints(description.sdp),
    });
  }

  private handleLocalCandidate(candidate: RTCIceCandidate | null): void {
    if (this.closed) {
      return;
    }
    if (!candidate) {
      this.options.sendSignal('end-of-candidates', {});
      return;
    }
    this.options.sendSignal('candidate', {
      candidate: {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
        usernameFragment: candidate.usernameFragment,
      },
    });
  }

  private async handleRemoteCandidate(value: unknown): Promise<void> {
    if (typeof value !== 'object' || value === null) {
      return;
    }
    const raw = value as Record<string, unknown>;
    if (typeof raw.candidate !== 'string' || raw.candidate.length === 0 || raw.candidate.length > MAX_CANDIDATE_LENGTH) {
      return;
    }
    if (this.receivedCandidates >= MAX_REMOTE_CANDIDATES) {
      return;
    }
    this.receivedCandidates += 1;
    const candidate: RTCIceCandidateInit = {
      candidate: raw.candidate,
      sdpMid: typeof raw.sdpMid === 'string' ? raw.sdpMid : null,
      sdpMLineIndex: typeof raw.sdpMLineIndex === 'number' ? raw.sdpMLineIndex : null,
      ...(typeof raw.usernameFragment === 'string' ? { usernameFragment: raw.usernameFragment } : {}),
    };
    if (!this.connection.remoteDescription) {
      this.pendingCandidates.push(candidate);
      return;
    }
    await this.addCandidate(candidate);
  }

  private async addCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    try {
      await this.connection.addIceCandidate(candidate);
    } catch {
      return;
    }
  }

  private async flushCandidates(): Promise<void> {
    const pending = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const candidate of pending) {
      await this.addCandidate(candidate);
    }
  }

  private handleTrack(event: RTCTrackEvent): void {
    const transceiver = event.transceiver as RTCRtpTransceiver | undefined;
    if (transceiver && (transceiver === this.screenTransceiver() || transceiver === this.screenAudioTransceiver())) {
      this.remoteScreen ??= this.deps.createStream();
      this.remoteScreen.addTrack(event.track);
      this.exposeRemoteScreen();
      return;
    }
    const stream = event.streams[0];
    if (stream) {
      this.exposeRemoteStream(stream);
      return;
    }
    this.fallbackStream ??= this.deps.createStream();
    this.fallbackStream.addTrack(event.track);
    this.exposeRemoteStream(this.fallbackStream);
  }

  private exposeRemoteStream(stream: MediaStream): void {
    if (this.verified) {
      this.options.onRemoteStream(stream);
      return;
    }
    this.pendingRemoteStreams.set(stream.id || 'fallback', stream);
  }

  private exposeRemoteScreen(): void {
    if (!this.verified || !this.remoteScreen || this.closed) {
      return;
    }
    this.remoteScreenExposed = true;
    this.options.onRemoteScreen?.(this.remoteScreen);
  }

  private handleIceState(): void {
    if (this.closed) {
      return;
    }
    const state = this.connection.iceConnectionState;
    if (state === 'connected' || state === 'completed') {
      this.clearDisconnectTimer();
      this.clearRetryTimer();
      this.attempt = 0;
      this.failingSince = null;
      const first = !this.connected;
      this.connected = true;
      if (this.connectTimer !== null) {
        clearTimeout(this.connectTimer);
        this.connectTimer = null;
      }
      if (this.verified) {
        this.options.onConnection('connected');
      }
      if (!this.verified && this.dtlsTimer === null) {
        this.armDtlsWatchdog();
      }
      if (first || !this.dtlsChecked) {
        this.verifyDtls();
      }
      void this.applyCaps();
      void this.updateRelayProbe();
      return;
    }
    if (state === 'disconnected') {
      this.options.onConnection('interrupted');
      this.failingSince ??= this.deps.now();
      this.clearDisconnectTimer();
      this.disconnectTimer = setTimeout(() => {
        this.disconnectTimer = null;
        if (this.connection.iceConnectionState === 'disconnected' && this.retryTimer === null) {
          this.recover('disconnected');
        }
      }, DISCONNECTED_RESTART_DELAY_MS);
      return;
    }
    if (state === 'failed') {
      this.clearDisconnectTimer();
      this.options.onConnection('interrupted');
      this.failingSince ??= this.deps.now();
      if (this.retryTimer === null) {
        this.recover('failed');
      }
    }
  }

  private armDtlsWatchdog(): void {
    this.dtlsTimer = setTimeout(() => {
      this.dtlsTimer = null;
      if (this.closed || this.verified) {
        return;
      }
      this.dtlsChecked = false;
      this.verifyDtls();
      if (!this.verified && !this.closed) {
        this.armDtlsWatchdog();
      }
    }, DTLS_VERIFY_TIMEOUT_MS);
  }

  isIceHealthy(): boolean {
    const state = this.connection.iceConnectionState;
    return state === 'connected' || state === 'completed';
  }

  recoverIfUnhealthy(reason: 'online' | 'resync'): void {
    if (reason === 'online') {
      this.probeFailures = 0;
    }
    if (this.closed || this.isIceHealthy() || this.retryTimer !== null) {
      return;
    }
    this.failingSince ??= this.deps.now();
    this.recover(reason);
  }

  private recover(reason: RestartReason, forceRelay = false): void {
    if (this.closed) {
      return;
    }
    const now = this.deps.now();
    this.failingSince ??= now;
    const relay = hasRelay(this.allServers) && (forceRelay || this.relayEnabled || restartUsesRelay(this.attempt, this.failingSince, now));
    this.useServers(relay);
    const first = this.attempt === 0;
    this.attempt += 1;
    this.options.onRestart?.(reason, relay);
    this.restartIce(first);
    if (relay && this.relayCredentialsDropped) {
      void this.refreshRelayCredentials().then(() => {
        if (!this.closed && this.relayEnabled && !this.isIceHealthy()) {
          this.restartIce(true);
        }
      });
    }
    this.clearRetryTimer();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.closed && !this.isIceHealthy()) {
        this.recover('retry');
      }
    }, retryDelay(this.attempt));
  }

  private useServers(relay: boolean): void {
    this.relayEnabled = relay;
    try {
      this.connection.setConfiguration({ ...this.connection.getConfiguration(), iceServers: relay ? this.allServers : directServers(this.allServers) });
    } catch {
      return;
    }
  }

  private clearRetryTimer(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private async updateRelayProbe(): Promise<void> {
    const relayed = this.relayEnabled && (await this.isRelayed());
    if (this.closed) {
      return;
    }
    if (!relayed) {
      this.probeFailures = 0;
      this.probePending = false;
      this.stopProbe();
      return;
    }
    this.startProbeTimer(this.probeFailures >= MAX_RELAY_PROBES ? RELAY_PROBE_SLOW_INTERVAL_MS : RELAY_PROBE_INTERVAL_MS);
  }

  private startProbeTimer(interval: number): void {
    if (this.probeTimer !== null && this.probeInterval === interval) {
      return;
    }
    this.stopProbe();
    this.probeInterval = interval;
    this.probeTimer = setInterval(() => {
      void this.probeTick();
    }, interval);
  }

  private async probeTick(): Promise<void> {
    if (this.probePending) {
      this.probePending = false;
      if (await this.isRelayed()) {
        this.probeFailures += 1;
      } else {
        this.probeFailures = 0;
        this.stopProbe();
        return;
      }
      if (this.probeFailures >= MAX_RELAY_PROBES) {
        this.startProbeTimer(RELAY_PROBE_SLOW_INTERVAL_MS);
      }
    }
    if (this.closed || !this.isIceHealthy() || this.retryTimer !== null || this.options.canProbeDirect?.() === false) {
      return;
    }
    this.probePending = true;
    this.options.onRestart?.('probe', true);
    this.restartIce(true);
  }

  private stopProbe(): void {
    if (this.probeTimer !== null) {
      clearInterval(this.probeTimer);
      this.probeTimer = null;
    }
  }

  private startKeepalive(): void {
    if (this.keepaliveTimer !== null) {
      return;
    }
    this.keepaliveTimer = setInterval(() => {
      if (!this.closed) {
        this.sendControl({ t: 'ping' });
      }
    }, KEEPALIVE_INTERVAL_MS);
  }

  private clearDisconnectTimer(): void {
    if (this.disconnectTimer !== null) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
  }

  restartIce(force = false): void {
    if (this.closed) {
      return;
    }
    const now = this.deps.now();
    if (!force && now - this.lastRestartAt < MIN_RESTART_GAP_MS) {
      return;
    }
    this.lastRestartAt = now;
    const resent = this.resendPendingOffer();
    if (this.polite && !this.connection.remoteDescription) {
      return;
    }
    this.receivedCandidates = 0;
    this.options.sendSignal('ice-restart', {});
    if (typeof this.connection.restartIce === 'function') {
      this.connection.restartIce();
      return;
    }
    if (!resent) {
      void this.restartWithOffer();
    }
  }

  private resendPendingOffer(): boolean {
    if (this.connection.signalingState !== 'have-local-offer' || this.makingOffer || !this.connection.localDescription) {
      return false;
    }
    this.sendDescription('offer');
    return true;
  }

  private async restartWithOffer(): Promise<void> {
    try {
      this.makingOffer = true;
      await this.setLocal('offer', { iceRestart: true });
      this.sendDescription('offer');
    } catch {
      return;
    } finally {
      this.makingOffer = false;
    }
  }

  private dtlsTransport(): RTCDtlsTransport | undefined {
    return this.connection.sctp?.transport ?? this.connection.getReceivers()[0]?.transport ?? this.connection.getSenders?.()[0]?.transport ?? undefined;
  }

  private verifyDtls(): void {
    if (this.dtlsChecked || this.closed || !this.connection.remoteDescription) {
      return;
    }
    if (this.remoteFingerprints.length === 0) {
      this.dtlsChecked = true;
      this.fatal('fingerprint-mismatch');
      return;
    }
    const transport = this.dtlsTransport();
    if (!transport) {
      return;
    }
    if (this.watchedTransport !== transport) {
      this.watchedTransport = transport;
      transport.onstatechange = () => this.verifyDtls();
    }
    if (transport.state !== 'connected') {
      return;
    }
    this.dtlsChecked = true;
    void this.checkCertificate(transport);
  }

  private async checkCertificate(transport: RTCDtlsTransport): Promise<void> {
    const expected = this.remoteFingerprints.filter((fingerprint) => fingerprint.startsWith('sha-256 '));
    if (typeof transport.getRemoteCertificates !== 'function') {
      const inRemote = extractSdpFingerprints(this.connection.remoteDescription?.sdp ?? '');
      const authenticated = new Set(this.remoteFingerprints);
      const allAuthenticated = inRemote.length > 0 && inRemote.every((fingerprint) => authenticated.has(fingerprint));
      if (expected.length > 0 && allAuthenticated && expected.every((fingerprint) => inRemote.includes(fingerprint))) {
        this.markVerified();
      } else {
        this.fatal('fingerprint-mismatch');
      }
      return;
    }
    try {
      const certificates = transport.getRemoteCertificates();
      const first = certificates[0];
      if (expected.length === 0 || !first) {
        this.fatal('fingerprint-mismatch');
        return;
      }
      const actual = await this.deps.hashCertificate(first);
      if (!expected.includes(`sha-256 ${actual.toUpperCase()}`)) {
        this.fatal('fingerprint-mismatch');
        return;
      }
      this.markVerified();
    } catch {
      this.fatal('fingerprint-mismatch');
    }
  }

  private markVerified(): void {
    if (this.closed) {
      return;
    }
    this.verified = true;
    this.startKeepalive();
    if (this.dtlsTimer !== null) {
      clearTimeout(this.dtlsTimer);
      this.dtlsTimer = null;
    }
    const pending = Array.from(this.pendingRemoteStreams.values());
    this.pendingRemoteStreams.clear();
    for (const stream of pending) {
      this.options.onRemoteStream(stream);
    }
    if (!this.remoteScreenExposed) {
      this.exposeRemoteScreen();
    }
    this.replayEarlyControls();
    void this.attachLocalTracks();
    this.announceState();
    const state = this.connection.iceConnectionState;
    if (state === 'connected' || state === 'completed') {
      this.options.onConnection('connected');
    }
  }

  private openControlChannel(): void {
    const channel = this.connection.createDataChannel(CONTROL_CHANNEL_LABEL, { negotiated: true, id: CONTROL_CHANNEL_ID });
    channel.onmessage = (event) => {
      const message = parseControlMessage(event.data);
      if (!message || message.t === 'ping') {
        return;
      }
      if (!this.verified) {
        if (EARLY_STATE_CONTROLS.has(message.t)) {
          this.earlyControls.set(message.t, message);
        }
        return;
      }
      this.deliverControl(message);
    };
    channel.onopen = () => this.announceState();
    this.control = channel;
  }

  private deliverControl(message: ControlMessage): void {
    if (message.t === 'caps') {
      this.peerScreenCaps = message.screen;
    }
    this.options.onControl(message);
  }

  private replayEarlyControls(): void {
    const early = Array.from(this.earlyControls.values());
    this.earlyControls.clear();
    for (const message of early) {
      this.deliverControl(message);
    }
  }

  private announceState(): void {
    if (!this.verified || this.closed) {
      return;
    }
    this.sendControl({ t: 'caps', screen: this.screenTransceiver() !== undefined });
    this.announceMedia();
  }

  private announceMedia(): void {
    if (!this.verified || this.closed) {
      return;
    }
    this.sendControl({ t: 'camera', on: Boolean(this.cameraTransceiver()?.sender.track) });
    const audio = this.options.localStream?.getAudioTracks()[0];
    if (audio) {
      this.sendControl({ t: 'mute', on: !audio.enabled });
    }
  }

  sendControl(message: ControlMessage): boolean {
    const channel = this.control;
    if (!channel || channel.readyState !== 'open' || (!this.verified && message.t !== 'hangup')) {
      return false;
    }
    channel.send(JSON.stringify(message));
    return true;
  }

  setMuted(muted: boolean): void {
    for (const track of this.options.localStream?.getAudioTracks() ?? []) {
      track.enabled = !muted;
    }
    this.sendControl({ t: 'mute', on: muted });
  }

  async setVideoTrack(track: MediaStreamTrack | null): Promise<boolean> {
    const transceiver = this.cameraTransceiver();
    if (!transceiver) {
      return true;
    }
    if (!this.verified || (this.options.localStream && !this.localAttached)) {
      this.pendingVideoTrack = track;
      return true;
    }
    if (track && this.degrade === 'audio-only-relay' && (await this.isRelayed())) {
      return false;
    }
    await transceiver.sender.replaceTrack(track);
    this.sendControl({ t: 'camera', on: track !== null });
    await this.applyCaps();
    return true;
  }

  async setAudioTrack(track: MediaStreamTrack): Promise<void> {
    if (!this.verified) {
      return;
    }
    await this.audioSender()?.replaceTrack(track);
  }

  canShareScreen(): boolean {
    return this.verified && !this.closed && this.peerScreenCaps && this.screenTransceiver() !== undefined;
  }

  updateScreenInfo(info: ScreenInfo): boolean {
    if (!this.screenTransceiver()?.sender.track) {
      return false;
    }
    return this.sendControl(screenControl(true, info));
  }

  async setScreenTracks(video: MediaStreamTrack | null, audio: MediaStreamTrack | null = null, info: ScreenInfo | null = null): Promise<boolean> {
    const transceiver = this.screenTransceiver();
    if (!transceiver || !this.verified || this.closed) {
      return false;
    }
    if (video && !this.peerScreenCaps) {
      return false;
    }
    if (video && this.degrade === 'audio-only-relay' && (await this.isRelayed())) {
      return false;
    }
    if (video && 'contentHint' in video) {
      video.contentHint = this.movie ? 'motion' : 'detail';
    }
    const audioSender = this.screenAudioTransceiver()?.sender;
    try {
      await transceiver.sender.replaceTrack(video);
      if (audioSender && (audio || audioSender.track)) {
        await audioSender.replaceTrack(video ? audio : null);
      }
    } catch {
      await transceiver.sender.replaceTrack(null).catch(() => undefined);
      await audioSender?.replaceTrack(null).catch(() => undefined);
      this.sendControl({ t: 'screen', on: false });
      return false;
    }
    this.sendControl(screenControl(video !== null, info));
    await this.applyCaps();
    return true;
  }

  async setMovieMode(movie: boolean): Promise<void> {
    this.movie = movie;
    const track = this.screenTransceiver()?.sender.track;
    if (track && 'contentHint' in track) {
      track.contentHint = movie ? 'motion' : 'detail';
    }
    await this.applyCaps();
  }

  async setNetworkUnstable(unstable: boolean): Promise<void> {
    if (this.unstable === unstable) {
      return;
    }
    this.unstable = unstable;
    await this.applyCaps();
  }

  private transceiversOf(kind: 'audio' | 'video'): RTCRtpTransceiver[] {
    return this.connection.getTransceivers().filter((transceiver) => (transceiver.receiver.track?.kind ?? transceiver.sender.track?.kind) === kind);
  }

  private cameraTransceiver(): RTCRtpTransceiver | undefined {
    return this.transceiversOf('video')[0];
  }

  private screenTransceiver(): RTCRtpTransceiver | undefined {
    return this.transceiversOf('video')[1];
  }

  private screenAudioTransceiver(): RTCRtpTransceiver | undefined {
    return this.transceiversOf('audio')[1];
  }

  private audioSender(): RTCRtpSender | undefined {
    return this.transceiversOf('audio')[0]?.sender;
  }

  async applyDegrade(step: DegradeStep | null): Promise<void> {
    this.degrade = step;
    await this.applyCaps();
  }

  async refreshBandwidth(): Promise<void> {
    if (this.closed || !this.verified) {
      return;
    }
    const estimate = await this.uplinkEstimate();
    if (estimate === null || this.closed) {
      return;
    }
    const previous = this.uplinkBps;
    if (previous !== null && Math.abs(estimate - previous) < previous * UPLINK_CHANGE_RATIO) {
      return;
    }
    this.uplinkBps = estimate;
    await this.applyCaps();
  }

  private fitToUplink(cap: number, sharingScreen: boolean): number {
    if (this.uplinkBps === null) {
      return cap;
    }
    const share = sharingScreen ? 0.25 : 0.75;
    const available = Math.floor(this.uplinkBps * share) - AUDIO_MAX_BITRATE;
    return Math.min(cap, Math.max(VIDEO_MIN_ADAPTIVE_BITRATE, available));
  }

  private async uplinkEstimate(): Promise<number | null> {
    try {
      const report = await this.connection.getStats();
      let estimate: number | null = null;
      report.forEach((entry: Record<string, unknown>) => {
        if (entry.type === 'candidate-pair' && entry.nominated === true && entry.state === 'succeeded' && typeof entry.availableOutgoingBitrate === 'number') {
          estimate = entry.availableOutgoingBitrate;
        }
      });
      return estimate;
    } catch {
      return null;
    }
  }

  private async isRelayed(): Promise<boolean> {
    try {
      const report = await this.connection.getStats();
      let relayed = false;
      report.forEach((entry: Record<string, unknown>) => {
        if (entry.type === 'candidate-pair' && entry.nominated === true && entry.state === 'succeeded') {
          const local = report.get(String(entry.localCandidateId)) as Record<string, unknown> | undefined;
          if (local?.candidateType === 'relay') {
            relayed = true;
          }
        }
      });
      return relayed;
    } catch {
      return false;
    }
  }

  private async applyCaps(): Promise<void> {
    if (this.closed) {
      return;
    }
    const degradeVideo = this.degrade === 'video-360';
    const audioOnly = this.degrade === 'audio-only-relay' && (await this.isRelayed());
    await this.setSenderCap(this.audioSender(), { maxBitrate: AUDIO_MAX_BITRATE, priority: 'high' });
    const videoSender = this.cameraTransceiver()?.sender;
    const screenSender = this.screenTransceiver()?.sender;
    const screenAudioSender = this.screenAudioTransceiver()?.sender;
    if (audioOnly && (videoSender?.track || screenSender?.track)) {
      if (videoSender?.track) {
        await videoSender.replaceTrack(null);
        this.sendControl({ t: 'camera', on: false });
      }
      if (screenSender?.track) {
        await screenSender.replaceTrack(null);
        await screenAudioSender?.replaceTrack(null);
        this.sendControl({ t: 'screen', on: false });
      }
      this.reportDegrade('audio-only-relay');
      return;
    }
    if (audioOnly) {
      this.reportDegrade('audio-only-relay');
      return;
    }
    const lowerCamera = degradeVideo || this.unstable;
    const cameraCap = this.unstable ? VIDEO_UNSTABLE_MAX_BITRATE : degradeVideo ? VIDEO_DEGRADED_MAX_BITRATE : VIDEO_MAX_BITRATE;
    await this.setSenderCap(videoSender, {
      maxBitrate: this.fitToUplink(cameraCap, Boolean(screenSender?.track)),
      scaleResolutionDownBy: lowerCamera ? (this.options.mobile ? 1.333 : 2) : 1,
      degradationPreference: 'maintain-framerate',
    });
    const screenSettings = screenSender?.track?.getSettings?.();
    await this.setSenderCap(
      screenSender,
      screenEncoding({
        movie: this.movie,
        relayed: this.movie && screenSender?.track ? await this.isRelayed() : false,
        degrade: this.degrade,
        width: screenSettings?.width ?? null,
        height: screenSettings?.height ?? null,
        frameRate: screenSettings?.frameRate ?? null,
        uplinkBps: this.movie && screenSender?.track ? await this.uplinkEstimate() : null,
      }),
    );
    await this.setSenderCap(screenAudioSender, { maxBitrate: this.movie ? MOVIE_AUDIO_MAX_BITRATE : SCREEN_AUDIO_MAX_BITRATE });
    this.reportDegrade(degradeVideo ? 'video-360' : null);
  }

  private reportDegrade(step: DegradeStep | null): void {
    if (step === this.reportedDegrade && step === null) {
      return;
    }
    this.reportedDegrade = step;
    this.options.onDegrade?.(step);
  }

  private async setSenderCap(sender: RTCRtpSender | undefined, cap: SenderCap): Promise<void> {
    if (!sender) {
      return;
    }
    try {
      await sender.setParameters(senderParameters(sender.getParameters(), cap, true));
    } catch {
      try {
        await sender.setParameters(senderParameters(sender.getParameters(), cap, false));
      } catch {
        return;
      }
    }
  }

  private scheduleCredentialRefresh(): void {
    const refresh = this.options.refreshIceServers;
    if (!refresh || this.closed) {
      return;
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      if (this.relayCredentialsDropped) {
        this.scheduleCredentialRefresh();
        return;
      }
      void refresh()
        .then((result) => this.applyRefresh(result))
        .catch(() => undefined)
        .finally(() => this.scheduleCredentialRefresh());
    }, CREDENTIAL_REFRESH_MS);
  }

  dropRelayCredentials(): void {
    this.relayCredentialsDropped = true;
  }

  private applyRefresh(result: IceRefresh | null): void {
    if (!result || this.closed) {
      return;
    }
    this.allServers = [...result.iceServers];
    this.useServers(this.relayEnabled);
    if (result.degrade !== undefined) {
      void this.applyDegrade(result.degrade);
    }
  }

  private refreshRelayCredentials(): Promise<void> {
    const refresh = this.options.refreshIceServers;
    if (!refresh) {
      return Promise.resolve();
    }
    this.relayCredentialsDropped = false;
    this.relayRefresh ??= refresh()
      .then((result) => {
        if (!result) {
          this.relayCredentialsDropped = true;
          return;
        }
        this.applyRefresh(result);
      })
      .catch(() => {
        this.relayCredentialsDropped = true;
      })
      .finally(() => {
        this.relayRefresh = null;
      });
    return this.relayRefresh;
  }

  getStats(): Promise<RTCStatsReport> {
    return this.connection.getStats();
  }

  private fatal(detail: string): void {
    if (this.closed) {
      return;
    }
    this.options.onFatal(detail);
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.clearDisconnectTimer();
    this.clearRetryTimer();
    for (const interval of [this.probeTimer, this.keepaliveTimer]) {
      if (interval !== null) {
        clearInterval(interval);
      }
    }
    this.probeTimer = null;
    this.keepaliveTimer = null;
    for (const timer of [this.connectTimer, this.refreshTimer, this.dtlsTimer]) {
      if (timer !== null) {
        clearTimeout(timer);
      }
    }
    this.connectTimer = null;
    this.refreshTimer = null;
    this.dtlsTimer = null;
    this.pendingRemoteStreams.clear();
    this.remoteScreen = null;
    this.pendingCandidates = [];
    this.connection.onicecandidate = null;
    this.connection.onnegotiationneeded = null;
    this.connection.oniceconnectionstatechange = null;
    this.connection.onconnectionstatechange = null;
    if (this.watchedTransport) {
      this.watchedTransport.onstatechange = null;
    }
    this.connection.ontrack = null;
    try {
      this.control?.close();
      this.connection.close();
    } catch {
      return;
    }
  }
}
