import type { CallKind, CallRole, SignalType } from '@lib/e2ee/call-crypto';

export type DegradeStep = 'video-360' | 'audio-only-relay';

export type ControlMessage = { t: 'hangup' } | { t: 'mute'; on: boolean } | { t: 'camera'; on: boolean };

export type ConnectionStatus = 'connected' | 'interrupted';

export const CONTROL_CHANNEL_LABEL = 'control';
export const CONTROL_CHANNEL_ID = 0;
export const DISCONNECTED_RESTART_DELAY_MS = 2_500;
export const CONNECT_RESTART_DELAY_MS = 20_000;
export const CREDENTIAL_REFRESH_MS = 3.5 * 60 * 60 * 1000;
export const AUDIO_MAX_BITRATE = 32_000;
export const VIDEO_MAX_BITRATE = 1_500_000;
export const VIDEO_DEGRADED_MAX_BITRATE = 600_000;
export const MAX_REMOTE_CANDIDATES = 200;
export const DTLS_VERIFY_TIMEOUT_MS = 10_000;
const MAX_SDP_LENGTH = 14_000;
const MAX_CANDIDATE_LENGTH = 2_048;
const MAX_CONTROL_LENGTH = 256;
const MAX_FINGERPRINTS = 4;
const MIN_RESTART_GAP_MS = 1_000;
const FINGERPRINT_PATTERN = /^[a-z0-9-]+ (?:[0-9A-Fa-f]{2}:)*[0-9A-Fa-f]{2}$/;
const SDP_FINGERPRINT = /^a=fingerprint:(\S+) (\S+)\s*$/gm;
const CANDIDATE_TYPE = / typ (\w+)/;

export interface PeerSessionDeps {
  createConnection: (config: RTCConfiguration) => RTCPeerConnection;
  hashCertificate: (certificate: ArrayBuffer) => Promise<string>;
  createStream: () => MediaStream;
  now: () => number;
}

export interface IceRefresh {
  iceServers: RTCIceServer[];
  degrade?: DegradeStep | null;
}

export interface PeerSessionOptions {
  role: CallRole;
  kind: CallKind;
  protectIp: boolean;
  mobile: boolean;
  iceServers: RTCIceServer[];
  degrade?: DegradeStep | null;
  localStream: MediaStream | null;
  sendSignal: (type: SignalType, payload: Record<string, unknown>) => void;
  refreshIceServers?: () => Promise<IceRefresh | null>;
  onConnection: (status: ConnectionStatus) => void;
  onFatal: (detail: string) => void;
  onRemoteStream: (stream: MediaStream) => void;
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
  };
}

export function extractSdpFingerprints(sdp: string): string[] {
  const found = new Set<string>();
  for (const match of sdp.matchAll(SDP_FINGERPRINT)) {
    found.add(`${(match[1] ?? '').toLowerCase()} ${(match[2] ?? '').toUpperCase()}`);
  }
  return Array.from(found);
}

export function candidateType(candidate: string): string | null {
  return CANDIDATE_TYPE.exec(candidate)?.[1] ?? null;
}

export function hasRelayServer(servers: readonly RTCIceServer[]): boolean {
  return servers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((url) => /^turns?:/i.test(url));
  });
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
      iceTransportPolicy: options.protectIp ? 'relay' : 'all',
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
    if (this.options.protectIp && !hasRelayServer(this.options.iceServers)) {
      this.fatal('relay-unavailable');
      return;
    }
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
    if (this.options.protectIp && candidateType(candidate.candidate) !== 'relay') {
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
    if (this.options.protectIp && candidateType(raw.candidate) !== 'relay') {
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
      if (expected.length > 0 && expected.every((fingerprint) => inRemote.includes(fingerprint))) {
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
    void this.attachLocalTracks();
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
      if (message) {
        this.options.onControl(message);
      }
    };
    this.control = channel;
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
    const transceiver = this.videoTransceiver();
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

  private videoTransceiver(): RTCRtpTransceiver | undefined {
    return this.connection.getTransceivers().find((transceiver) => (transceiver.receiver.track?.kind ?? transceiver.sender.track?.kind) === 'video');
  }

  private audioSender(): RTCRtpSender | undefined {
    return this.connection.getTransceivers().find((transceiver) => (transceiver.receiver.track?.kind ?? transceiver.sender.track?.kind) === 'audio')?.sender;
  }

  async applyDegrade(step: DegradeStep | null): Promise<void> {
    this.degrade = step;
    await this.applyCaps();
  }

  private async isRelayed(): Promise<boolean> {
    if (this.options.protectIp) {
      return true;
    }
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
    await this.setSenderCap(this.audioSender(), { maxBitrate: AUDIO_MAX_BITRATE });
    const videoSender = this.videoTransceiver()?.sender;
    if (audioOnly && videoSender?.track) {
      await videoSender.replaceTrack(null);
      this.sendControl({ t: 'camera', on: false });
      this.options.onDegrade?.('audio-only-relay');
      return;
    }
    await this.setSenderCap(videoSender, {
      maxBitrate: degradeVideo ? VIDEO_DEGRADED_MAX_BITRATE : VIDEO_MAX_BITRATE,
      scaleResolutionDownBy: degradeVideo ? (this.options.mobile ? 1.333 : 2) : 1,
    });
    if (degradeVideo) {
      this.options.onDegrade?.('video-360');
    }
  }

  private async setSenderCap(sender: RTCRtpSender | undefined, cap: { maxBitrate: number; scaleResolutionDownBy?: number }): Promise<void> {
    if (!sender) {
      return;
    }
    try {
      const parameters = sender.getParameters();
      const encodings = parameters.encodings?.length ? parameters.encodings : [{}];
      const first = encodings[0] ?? {};
      first.maxBitrate = cap.maxBitrate;
      if (cap.scaleResolutionDownBy !== undefined) {
        first.scaleResolutionDownBy = cap.scaleResolutionDownBy;
      }
      encodings[0] = first;
      await sender.setParameters({ ...parameters, encodings });
    } catch {
      return;
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
