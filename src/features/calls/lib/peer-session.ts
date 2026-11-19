import type { CallKind, CallRole, SignalType } from '@lib/e2ee/call-crypto';
import type { ShareSurfaceKind } from './share-surface';

export type DegradeStep = 'video-360' | 'audio-only-relay';

export type ControlMessage = { t: 'hangup' } | { t: 'mute'; on: boolean } | { t: 'camera'; on: boolean } | ScreenControl | { t: 'caps'; screen: boolean };

export interface ScreenInfo {
  surface: ShareSurfaceKind;
  label: string | null;
}

export interface ScreenControl {
  t: 'screen';
  on: boolean;
  surface?: ShareSurfaceKind;
  label?: string;
}

export const MAX_SCREEN_LABEL_LENGTH = 80;
const SURFACES: ReadonlySet<string> = new Set(['browser', 'window', 'monitor', 'unknown']);
function isUnsafeChar(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029 || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);
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
export const CREDENTIAL_REFRESH_MS = 3.5 * 60 * 60 * 1000;
export const AUDIO_MAX_BITRATE = 32_000;
export const VIDEO_MAX_BITRATE = 1_500_000;
export const VIDEO_DEGRADED_MAX_BITRATE = 600_000;
export const VIDEO_UNSTABLE_MAX_BITRATE = 350_000;
export const SCREEN_MAX_BITRATE = 2_500_000;
export const SCREEN_DEGRADED_MAX_BITRATE = 1_000_000;
export const SCREEN_AUDIO_MAX_BITRATE = 64_000;
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

export function screenVideoCodecs(codecs: readonly RTCRtpCodec[]): RTCRtpCodec[] {
  const primary = codecs.filter(isCompactScreenCodec);
  if (primary.length === 0) {
    return [];
  }
  return codecs.filter((codec) => primary.includes(codec) || mimeOf(codec) === 'video/rtx');
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
    if (message.t === 'caps' && typeof message.screen === 'boolean') {
      return { t: 'caps', screen: message.screen };
    }
    if (message.t === 'screen' && typeof message.on === 'boolean') {
      const screen: ScreenControl = { t: 'screen', on: message.on };
      if (message.on && typeof message.surface === 'string' && SURFACES.has(message.surface)) {
        screen.surface = message.surface as ShareSurfaceKind;
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
  private remoteScreen: MediaStream | null = null;
  private remoteScreenExposed = false;
  private unstable = false;
  private peerScreenCaps = false;

  constructor(options: PeerSessionOptions) {
    this.options = options;
    this.deps = { ...defaultDeps(), ...options.deps };
    this.polite = options.role === 'callee';
    this.degrade = options.degrade ?? null;
    this.connection = this.deps.createConnection({
      iceServers: options.iceServers,
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
        this.restartIce();
      }
    }, CONNECT_RESTART_DELAY_MS);
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
      await connection.setLocalDescription();
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
      const transceiver = this.connection.getTransceivers().find((candidate) => (candidate.receiver.track?.kind ?? candidate.sender.track?.kind) === track.kind);
      if (transceiver && !(await this.replaceWithRetry(transceiver.sender, track))) {
        this.fatal('media-attach-failed');
        return;
      }
    }
    await this.applyCaps();
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

  private async negotiate(): Promise<void> {
    if (this.closed) {
      return;
    }
    try {
      this.makingOffer = true;
      await this.connection.setLocalDescription();
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
      const first = !this.connected;
      this.connected = true;
      if (this.connectTimer !== null) {
        clearTimeout(this.connectTimer);
        this.connectTimer = null;
      }
      if (this.verified) {
        this.options.onConnection('connected');
      }
      if (first && !this.verified && this.dtlsTimer === null) {
        this.dtlsTimer = setTimeout(() => {
          this.dtlsTimer = null;
          if (!this.verified) {
            this.fatal('fingerprint-mismatch');
          }
        }, DTLS_VERIFY_TIMEOUT_MS);
      }
      if (first || !this.dtlsChecked) {
        this.verifyDtls();
      }
      void this.applyCaps();
      return;
    }
    if (state === 'disconnected') {
      this.options.onConnection('interrupted');
      this.clearDisconnectTimer();
      this.disconnectTimer = setTimeout(() => {
        this.disconnectTimer = null;
        if (this.connection.iceConnectionState === 'disconnected') {
          this.restartIce();
        }
      }, DISCONNECTED_RESTART_DELAY_MS);
      return;
    }
    if (state === 'failed') {
      this.clearDisconnectTimer();
      this.options.onConnection('interrupted');
      this.restartIce();
    }
  }

  private clearDisconnectTimer(): void {
    if (this.disconnectTimer !== null) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
  }

  restartIce(): void {
    if (this.closed) {
      return;
    }
    const now = this.deps.now();
    if (now - this.lastRestartAt < MIN_RESTART_GAP_MS) {
      return;
    }
    this.lastRestartAt = now;
    this.receivedCandidates = 0;
    this.options.sendSignal('ice-restart', {});
    if (typeof this.connection.restartIce === 'function') {
      this.connection.restartIce();
      return;
    }
    void this.restartWithOffer();
  }

  private async restartWithOffer(): Promise<void> {
    try {
      this.makingOffer = true;
      await this.connection.setLocalDescription(await this.connection.createOffer({ iceRestart: true }));
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
      if (this.connected) {
        this.dtlsChecked = true;
        this.fatal('fingerprint-mismatch');
      }
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
    void this.attachLocalTracks();
    this.announceCaps();
    const state = this.connection.iceConnectionState;
    if (state === 'connected' || state === 'completed') {
      this.options.onConnection('connected');
    }
  }

  private openControlChannel(): void {
    const channel = this.connection.createDataChannel(CONTROL_CHANNEL_LABEL, { negotiated: true, id: CONTROL_CHANNEL_ID });
    channel.onmessage = (event) => {
      if (!this.verified) {
        return;
      }
      const message = parseControlMessage(event.data);
      if (!message) {
        return;
      }
      if (message.t === 'caps') {
        this.peerScreenCaps = message.screen;
      }
      this.options.onControl(message);
    };
    channel.onopen = () => this.announceCaps();
    this.control = channel;
  }

  private announceCaps(): void {
    if (this.verified && !this.closed) {
      this.sendControl({ t: 'caps', screen: this.screenTransceiver() !== undefined });
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

  async setVideoTrack(track: MediaStreamTrack | null): Promise<void> {
    const transceiver = this.cameraTransceiver();
    if (!transceiver || !this.verified) {
      return;
    }
    if (track && this.degrade === 'audio-only-relay' && (await this.isRelayed())) {
      return;
    }
    await transceiver.sender.replaceTrack(track);
    this.sendControl({ t: 'camera', on: track !== null });
    await this.applyCaps();
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
      video.contentHint = 'detail';
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
      this.options.onDegrade?.('audio-only-relay');
      return;
    }
    const lowerCamera = degradeVideo || this.unstable;
    await this.setSenderCap(videoSender, {
      maxBitrate: this.unstable ? VIDEO_UNSTABLE_MAX_BITRATE : degradeVideo ? VIDEO_DEGRADED_MAX_BITRATE : VIDEO_MAX_BITRATE,
      scaleResolutionDownBy: lowerCamera ? (this.options.mobile ? 1.333 : 2) : 1,
      degradationPreference: 'maintain-framerate',
    });
    await this.setSenderCap(screenSender, {
      maxBitrate: degradeVideo ? SCREEN_DEGRADED_MAX_BITRATE : SCREEN_MAX_BITRATE,
      degradationPreference: 'maintain-resolution',
    });
    await this.setSenderCap(screenAudioSender, { maxBitrate: SCREEN_AUDIO_MAX_BITRATE });
    if (degradeVideo) {
      this.options.onDegrade?.('video-360');
    }
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
    if (!refresh) {
      return;
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void refresh()
        .then((result) => {
          if (result && !this.closed) {
            this.connection.setConfiguration({ ...this.connection.getConfiguration(), iceServers: result.iceServers });
            if (result.degrade !== undefined) {
              void this.applyDegrade(result.degrade);
            }
          }
        })
        .catch(() => undefined)
        .finally(() => this.scheduleCredentialRefresh());
    }, CREDENTIAL_REFRESH_MS);
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
