import {
  SignalChannel,
  createAcceptEnvelope,
  createInviteEnvelope,
  deriveSessionKeys,
  generateEphemeralKeyPair,
  newCallId,
  newDeviceId,
  openAcceptEnvelope,
  openInviteEnvelope,
  zeroEphemeralKeyPair,
  type CallKind,
  type EphemeralKeyPair,
  type OpenedSignal,
  type PinnedPeer,
  type SignalType,
} from '@lib/e2ee/call-crypto';
import type { CurrentIdentity } from '@lib/e2ee/current-identity';
import type { CallConfigPayload, CallDegradeWire, CallIceServersResult, CallStatePayload, SocketErrorPayload } from '@lib/socket/socket-events';
import {
  createCallMachine,
  hasCallMedia,
  isCallLive,
  IDLE_CALL_STATE,
  type CallEffect,
  type CallEndReason,
  type CallMachine,
  type CallState,
} from '../state/call-machine';
import { readQuality, STATS_INTERVAL_MS, type QualityBars, type QualitySample } from './call-stats';
import type { LocalMedia } from './media-devices';
import type { ConnectionStatus, ControlMessage, DegradeStep, IceRefresh } from './peer-session';
import type { TabCallInfo, TabCallMessage, TabOwnership } from './tab-ownership';

export const HEARTBEAT_INTERVAL_MS = 10_000;
export const ICE_SERVERS_TIMEOUT_MS = 8_000;
export const FALLBACK_STUN: RTCIceServer = { urls: 'stun:stun.cloudflare.com:3478' };
const MAX_KNOWN_CALL_IDS = 200;
const PORT_53 = /:53(?:\?|$)/;

export type CallNoticeKind =
  | 'media-denied'
  | 'key-changed'
  | 'unverifiable'
  | 'relay-unavailable'
  | 'other-tab'
  | 'disabled'
  | 'interrupted'
  | 'server-error';

export interface CallNotice {
  kind: CallNoticeKind;
  code?: string;
}

export interface CallSnapshot {
  state: CallState;
  enabled: boolean;
  relayAvailable: boolean;
  muted: boolean;
  cameraOn: boolean;
  cameraFailed: boolean;
  remoteMuted: boolean;
  remoteCameraOn: boolean;
  quality: QualityBars | null;
  degrade: DegradeStep | null;
  notice: CallNotice | null;
  otherTab: TabCallInfo | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  durationSeconds: number | null;
}

export interface PeerSessionLike {
  start: () => void;
  receiveSignal: (type: SignalType, payload: Record<string, unknown>) => Promise<void>;
  restartIce: () => void;
  sendControl: (message: ControlMessage) => boolean;
  setMuted: (muted: boolean) => void;
  setVideoTrack: (track: MediaStreamTrack | null) => Promise<void>;
  setAudioTrack: (track: MediaStreamTrack) => Promise<void>;
  applyDegrade: (step: DegradeStep | null) => Promise<void>;
  getStats: () => Promise<RTCStatsReport>;
  close: () => void;
}

export interface PeerSessionFactoryOptions {
  role: 'caller' | 'callee';
  kind: CallKind;
  protectIp: boolean;
  mobile: boolean;
  iceServers: RTCIceServer[];
  degrade: DegradeStep | null;
  localStream: MediaStream | null;
  sendSignal: (type: SignalType, payload: Record<string, unknown>) => void;
  refreshIceServers: () => Promise<IceRefresh | null>;
  onConnection: (status: ConnectionStatus) => void;
  onFatal: (detail: string) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onControl: (message: ControlMessage) => void;
  onDegrade: (step: DegradeStep | null) => void;
}

export type ResolvedPeer = { peer: PinnedPeer } | { error: 'key-changed' | 'unverifiable' };

export interface CallSocket {
  connected?: boolean;
  on: (event: string, handler: (...args: never[]) => void) => unknown;
  off: (event: string, handler: (...args: never[]) => void) => unknown;
  emit: (event: string, ...args: unknown[]) => unknown;
}

export interface CallControllerDeps {
  socket: CallSocket;
  getIdentity: () => CurrentIdentity | null;
  resolvePeer: (userId: string) => Promise<ResolvedPeer>;
  isPrivateRoomWith: (roomId: string, selfId: string, peerId: string) => boolean;
  tabs: TabOwnership;
  acquireMedia: (kind: CallKind) => Promise<LocalMedia>;
  acquireCamera: () => Promise<MediaStreamTrack | null>;
  stopMedia: (stream: MediaStream | null) => void;
  createPeerSession: (options: PeerSessionFactoryOptions) => PeerSessionLike;
  getProtectIp: () => boolean;
  isMobile: () => boolean;
  startRingtone: (pattern: 'incoming' | 'outgoing') => void;
  stopRingtone: () => void;
  acquireWakeLock: () => void;
  releaseWakeLock: () => void;
  now: () => number;
}

interface Session {
  callId: string;
  role: 'caller' | 'callee';
  kind: CallKind;
  roomId: string;
  peerId: string;
  peer: PinnedPeer;
  ownEk: EphemeralKeyPair | null;
  peerEk: string | null;
  envelope: string;
  channel: SignalChannel | null;
  media: LocalMedia | null;
  peerSession: PeerSessionLike | null;
  pendingSignals: OpenedSignal[];
  signalChain: Promise<void>;
  sendChain: Promise<void>;
  protectIp: boolean;
  handledAccept: boolean;
  statsSample: QualitySample | null;
}

interface PendingIce {
  resolve: (result: CallIceServersResult | null) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function toIceServers(result: CallIceServersResult): RTCIceServer[] {
  const servers: RTCIceServer[] = [];
  for (const entry of result.iceServers) {
    const urls = (Array.isArray(entry.urls) ? entry.urls : [entry.urls]).filter((url) => typeof url === 'string' && !PORT_53.test(url));
    if (urls.length === 0) {
      continue;
    }
    servers.push({ urls, ...(entry.username ? { username: entry.username } : {}), ...(entry.credential ? { credential: entry.credential } : {}) });
  }
  return servers;
}

function toDegrade(value: CallDegradeWire | null | undefined): DegradeStep | null {
  return value === 'video-360' || value === 'audio-only-relay' ? value : null;
}

export function initialSnapshot(): CallSnapshot {
  return {
    state: IDLE_CALL_STATE,
    enabled: false,
    relayAvailable: false,
    muted: false,
    cameraOn: false,
    cameraFailed: false,
    remoteMuted: false,
    remoteCameraOn: false,
    quality: null,
    degrade: null,
    notice: null,
    otherTab: null,
    localStream: null,
    remoteStream: null,
    durationSeconds: null,
  };
}

export class CallController {
  private readonly deps: CallControllerDeps;
  private readonly machine: CallMachine;
  private readonly listeners = new Set<() => void>();
  private readonly knownCallIds = new Set<string>();
  private readonly pendingIce = new Map<string, PendingIce>();
  private readonly detach: Array<() => void> = [];
  private snapshot: CallSnapshot = initialSnapshot();
  private session: Session | null = null;
  private preparing = false;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private lastPhase = IDLE_CALL_STATE.phase;
  private disposed = false;

  constructor(deps: CallControllerDeps) {
    this.deps = deps;
    this.machine = createCallMachine({
      onEffect: (effect) => this.handleEffect(effect),
      onChange: (state) => this.handleChange(state),
    });
    this.bindSocket();
    this.detach.push(
      this.deps.tabs.subscribe((message) => this.handleTabMessage(message)),
    );
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): CallSnapshot => this.snapshot;

  private update(patch: Partial<CallSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of Array.from(this.listeners)) {
      listener();
    }
  }

  private bindSocket(): void {
    const { socket } = this.deps;
    const handlers: Array<[string, (...args: never[]) => void]> = [
      ['call:config', (payload: CallConfigPayload) => this.onConfig(payload)],
      ['call:incoming', (payload: Parameters<CallController['onIncoming']>[0]) => void this.onIncoming(payload)],
      ['call:accepted', (payload: { callId: string; envelope: string; deviceId: string }) => void this.onAccepted(payload)],
      ['call:answered-elsewhere', (payload: { callId: string }) => this.machine.dispatch({ type: 'answered-elsewhere', callId: payload.callId })],
      ['call:declined-elsewhere', (payload: { callId: string }) => this.machine.dispatch({ type: 'declined-elsewhere', callId: payload.callId })],
      ['call:signal', (payload: { callId: string; from: string; envelope: string }) => this.onSignal(payload)],
      ['call:ended', (payload: { callId: string; reason: CallEndReason }) => this.machine.dispatch({ type: 'remote-ended', callId: payload.callId, reason: payload.reason })],
      ['call:state', (payload: CallStatePayload | null) => void this.onServerState(payload)],
      ['call:ice-servers-result', (payload: CallIceServersResult) => this.onIceResult(payload)],
      ['error', (payload: SocketErrorPayload) => this.onSocketError(payload)],
      ['connect', () => this.requestSync()],
      ['user:resumed', () => this.requestSync()],
      ['user:registered', () => this.requestSync()],
    ];
    for (const [event, handler] of handlers) {
      socket.on(event, handler);
      this.detach.push(() => socket.off(event, handler));
    }
    if (socket.connected) {
      this.requestSync();
    }
    if (typeof window !== 'undefined') {
      const online = () => this.session?.peerSession?.restartIce();
      window.addEventListener('online', online);
      this.detach.push(() => window.removeEventListener('online', online));
    }
  }

  private requestSync(): void {
    this.deps.socket.emit('call:sync', {});
  }

  private onConfig(payload: CallConfigPayload): void {
    this.update({ enabled: payload.enabled === true, relayAvailable: payload.relayAvailable === true });
  }

  private async onIncoming(payload: {
    callId: string;
    roomId: string;
    kind: CallKind;
    callerId: string;
    envelope: string;
  }): Promise<void> {
    const identity = this.deps.getIdentity();
    if (!identity || !this.snapshot.enabled || this.preparing || isCallLive(this.machine.getState())) {
      return;
    }
    if (typeof payload.callId !== 'string' || this.knownCallIds.has(payload.callId)) {
      return;
    }
    if (!this.deps.isPrivateRoomWith(payload.roomId, identity.userId, payload.callerId)) {
      return;
    }
    this.preparing = true;
    try {
      const resolved = await this.deps.resolvePeer(payload.callerId);
      if ('error' in resolved) {
        return;
      }
      const content = await openInviteEnvelope({
        identity,
        caller: resolved.peer,
        claimedCallerId: payload.callerId,
        claimedRoomId: payload.roomId,
        claimedKind: payload.kind,
        envelope: payload.envelope,
        knownCallIds: this.knownCallIds,
      });
      if (!content || isCallLive(this.machine.getState())) {
        return;
      }
      this.rememberCallId(content.callId);
      this.session = {
        callId: content.callId,
        role: 'callee',
        kind: content.kind,
        roomId: content.roomId,
        peerId: content.callerId,
        peer: resolved.peer,
        ownEk: null,
        peerEk: content.ekA,
        envelope: '',
        channel: null,
        media: null,
        peerSession: null,
        pendingSignals: [],
        signalChain: Promise.resolve(),
        sendChain: Promise.resolve(),
        protectIp: this.deps.getProtectIp(),
        handledAccept: false,
        statsSample: null,
      };
      this.machine.dispatch({ type: 'incoming', callId: content.callId, roomId: content.roomId, peerId: content.callerId, kind: content.kind });
    } catch {
      return;
    } finally {
      this.preparing = false;
    }
  }

  private rememberCallId(callId: string): void {
    this.knownCallIds.add(callId);
    if (this.knownCallIds.size > MAX_KNOWN_CALL_IDS) {
      const oldest = this.knownCallIds.values().next().value;
      if (oldest !== undefined) {
        this.knownCallIds.delete(oldest);
      }
    }
  }

  async startCall(input: { roomId: string; peerId: string; kind: CallKind }): Promise<void> {
    if (this.disposed || this.preparing || isCallLive(this.machine.getState())) {
      return;
    }
    if (!this.snapshot.enabled) {
      this.update({ notice: { kind: 'disabled' } });
      return;
    }
    const identity = this.deps.getIdentity();
    if (!identity) {
      return;
    }
    const protectIp = this.deps.getProtectIp();
    if (protectIp && !this.snapshot.relayAvailable) {
      this.update({ notice: { kind: 'relay-unavailable' } });
      return;
    }
    this.preparing = true;
    this.update({ notice: null });
    let owned = false;
    let media: LocalMedia | null = null;
    let ek: EphemeralKeyPair | null = null;
    try {
      owned = await this.deps.tabs.claimCall();
      if (!owned) {
        this.update({ notice: { kind: 'other-tab' } });
        return;
      }
      const resolved = await this.deps.resolvePeer(input.peerId);
      if ('error' in resolved) {
        this.update({ notice: { kind: resolved.error } });
        return;
      }
      try {
        media = await this.deps.acquireMedia(input.kind);
      } catch {
        this.update({ notice: { kind: 'media-denied' } });
        return;
      }
      const callId = await newCallId();
      ek = await generateEphemeralKeyPair();
      const envelope = await createInviteEnvelope({
        identity,
        calleePublicKey: resolved.peer.publicKey,
        callId,
        roomId: input.roomId,
        kind: input.kind,
        calleeId: input.peerId,
        ekA: ek.publicKey,
      });
      this.rememberCallId(callId);
      this.session = {
        callId,
        role: 'caller',
        kind: input.kind,
        roomId: input.roomId,
        peerId: input.peerId,
        peer: resolved.peer,
        ownEk: ek,
        peerEk: null,
        envelope,
        channel: null,
        media,
        peerSession: null,
        pendingSignals: [],
        signalChain: Promise.resolve(),
        sendChain: Promise.resolve(),
        protectIp,
        handledAccept: false,
        statsSample: null,
      };
      const handedOver = media;
      media = null;
      ek = null;
      this.update({ muted: false, cameraOn: handedOver.stream.getVideoTracks().length > 0, cameraFailed: handedOver.cameraFailed, localStream: handedOver.stream });
      this.machine.dispatch({ type: 'start', callId, roomId: input.roomId, peerId: input.peerId, kind: input.kind });
    } catch {
      this.update({ notice: { kind: 'interrupted' } });
    } finally {
      this.preparing = false;
      if (media) {
        this.deps.stopMedia(media.stream);
      }
      if (ek) {
        zeroEphemeralKeyPair(ek);
      }
      if (this.session === null && owned) {
        this.deps.tabs.releaseCall();
      }
    }
  }

  async accept(): Promise<void> {
    const state = this.machine.getState();
    const session = this.session;
    const identity = this.deps.getIdentity();
    if (!session || !identity || state.phase !== 'incoming-ringing' || state.callId !== session.callId || this.preparing) {
      return;
    }
    this.preparing = true;
    this.update({ notice: null });
    let owned = false;
    let media: LocalMedia | null = null;
    let ek: EphemeralKeyPair | null = null;
    try {
      owned = await this.deps.tabs.claimCall();
      if (!owned) {
        this.update({ notice: { kind: 'other-tab' } });
        return;
      }
      try {
        media = await this.deps.acquireMedia(session.kind);
      } catch {
        this.update({ notice: { kind: 'media-denied' } });
        return;
      }
      ek = await generateEphemeralKeyPair();
      const deviceId = await newDeviceId();
      const envelope = await createAcceptEnvelope({
        identity,
        callerPublicKey: session.peer.publicKey,
        callId: session.callId,
        callerId: session.peerId,
        deviceId,
        ekB: ek.publicKey,
      });
      const keys = await deriveSessionKeys({
        role: 'callee',
        callId: session.callId,
        callerPublicKey: session.peer.publicKey,
        calleePublicKey: identity.publicKey,
        ownEphemeral: ek,
        peerEphemeralPublicKey: session.peerEk ?? '',
      });
      if (this.machine.getState().callId !== session.callId || this.machine.getState().phase !== 'incoming-ringing') {
        keys.send.fill(0);
        keys.receive.fill(0);
        return;
      }
      session.channel = new SignalChannel({ callId: session.callId, selfId: identity.userId, peerId: session.peerId, keys });
      session.envelope = envelope;
      session.media = media;
      const handedOver = media;
      media = null;
      this.update({ muted: false, cameraOn: handedOver.stream.getVideoTracks().length > 0, cameraFailed: handedOver.cameraFailed, localStream: handedOver.stream });
      this.machine.dispatch({ type: 'accept-local', callId: session.callId });
    } catch {
      this.update({ notice: { kind: 'interrupted' } });
    } finally {
      this.preparing = false;
      if (media) {
        this.deps.stopMedia(media.stream);
      }
      if (ek) {
        zeroEphemeralKeyPair(ek);
      }
      if (owned && this.machine.getState().phase === 'incoming-ringing') {
        this.deps.tabs.releaseCall();
      }
    }
  }

  decline(): void {
    const callId = this.machine.getState().callId;
    if (callId) {
      this.machine.dispatch({ type: 'decline-local', callId });
    }
  }

  silence(): void {
    const state = this.machine.getState();
    if (state.phase === 'incoming-ringing' && state.callId) {
      this.deps.stopRingtone();
      this.deps.tabs.releaseRingtone();
      this.deps.socket.emit('call:silence', { callId: state.callId });
    }
  }

  hangup(): void {
    const state = this.machine.getState();
    if (!state.callId) {
      return;
    }
    this.session?.peerSession?.sendControl({ t: 'hangup' });
    this.machine.dispatch({ type: 'hangup-local', callId: state.callId });
  }

  dismissNotice(): void {
    this.update({ notice: null });
  }

  toggleMute(): void {
    const peer = this.session?.peerSession;
    const next = !this.snapshot.muted;
    if (this.session?.media) {
      for (const track of this.session.media.stream.getAudioTracks()) {
        track.enabled = !next;
      }
    }
    peer?.setMuted(next);
    this.update({ muted: next });
  }

  async toggleCamera(): Promise<void> {
    const session = this.session;
    const phase = this.machine.getState().phase;
    if (!session?.media || !session.peerSession || (phase !== 'active' && phase !== 'reconnecting')) {
      return;
    }
    const stream = session.media.stream;
    if (this.snapshot.cameraOn) {
      for (const track of stream.getVideoTracks()) {
        track.stop();
        stream.removeTrack(track);
      }
      await session.peerSession.setVideoTrack(null);
      this.update({ cameraOn: false, localStream: stream });
      return;
    }
    const track = await this.deps.acquireCamera();
    if (!track) {
      this.update({ cameraFailed: true });
      return;
    }
    stream.addTrack(track);
    await session.peerSession.setVideoTrack(track);
    this.update({ cameraOn: true, cameraFailed: false, localStream: stream });
  }

  async replaceAudioInput(track: MediaStreamTrack): Promise<void> {
    const session = this.session;
    if (!session?.media || !session.peerSession) {
      track.stop();
      return;
    }
    const stream = session.media.stream;
    for (const old of stream.getAudioTracks()) {
      old.stop();
      stream.removeTrack(old);
    }
    track.enabled = !this.snapshot.muted;
    stream.addTrack(track);
    await session.peerSession.setAudioTrack(track);
    this.update({ localStream: stream });
  }

  async replaceVideoInput(track: MediaStreamTrack): Promise<void> {
    const session = this.session;
    if (!session?.media || !session.peerSession) {
      track.stop();
      return;
    }
    const stream = session.media.stream;
    for (const old of stream.getVideoTracks()) {
      old.stop();
      stream.removeTrack(old);
    }
    stream.addTrack(track);
    await session.peerSession.setVideoTrack(track);
    this.update({ cameraOn: true, localStream: stream });
  }

  private async onAccepted(payload: { callId: string; envelope: string; deviceId: string }): Promise<void> {
    const session = this.session;
    const identity = this.deps.getIdentity();
    if (!session || !identity || session.role !== 'caller' || session.callId !== payload.callId || session.handledAccept) {
      return;
    }
    if (this.machine.getState().phase !== 'outgoing-ringing') {
      return;
    }
    session.handledAccept = true;
    const fail = (detail: string) => this.machine.dispatch({ type: 'failure', callId: session.callId, detail });
    try {
      const content = await openAcceptEnvelope({
        identity,
        callee: session.peer,
        expectedCallId: session.callId,
        expectedCalleeId: session.peerId,
        envelope: payload.envelope,
      });
      if (!content || !session.ownEk) {
        fail('invalid-accept');
        return;
      }
      const keys = await deriveSessionKeys({
        role: 'caller',
        callId: session.callId,
        callerPublicKey: identity.publicKey,
        calleePublicKey: session.peer.publicKey,
        ownEphemeral: session.ownEk,
        peerEphemeralPublicKey: content.ekB,
      });
      zeroEphemeralKeyPair(session.ownEk);
      session.ownEk = null;
      session.channel = new SignalChannel({ callId: session.callId, selfId: identity.userId, peerId: session.peerId, keys });
      this.machine.dispatch({ type: 'remote-accepted', callId: session.callId });
    } catch {
      fail('invalid-accept');
    }
  }

  private onSignal(payload: { callId: string; from: string; envelope: string }): void {
    const session = this.session;
    if (!session || session.callId !== payload.callId || !session.channel) {
      return;
    }
    const channel = session.channel;
    session.signalChain = session.signalChain.then(async () => {
      const opened = await channel.open(payload.envelope, payload.from);
      if (!opened || this.session !== session) {
        return;
      }
      if (session.peerSession) {
        void session.peerSession.receiveSignal(opened.type, opened.payload);
      } else {
        session.pendingSignals.push(opened);
      }
    });
  }

  private sendSignal(session: Session, type: SignalType, payload: Record<string, unknown>): void {
    const channel = session.channel;
    if (!channel) {
      return;
    }
    session.sendChain = session.sendChain.then(async () => {
      try {
        const envelope = await channel.seal(type, payload);
        if (this.session === session) {
          this.deps.socket.emit('call:signal', { callId: session.callId, to: session.peerId, envelope });
        }
      } catch {
        if (this.session === session) {
          this.machine.dispatch({ type: 'failure', callId: session.callId, detail: 'signal-failed' });
        }
      }
    });
  }

  private onIceResult(payload: CallIceServersResult): void {
    const pending = this.pendingIce.get(payload.callId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingIce.delete(payload.callId);
      pending.resolve(payload);
    }
  }

  private requestIce(session: Session): Promise<CallIceServersResult | null> {
    this.pendingIce.get(session.callId)?.resolve(null);
    return new Promise<CallIceServersResult | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingIce.delete(session.callId);
        resolve(null);
      }, ICE_SERVERS_TIMEOUT_MS);
      this.pendingIce.set(session.callId, { resolve, reject, timer });
      this.deps.socket.emit('call:ice-servers', { callId: session.callId, protectIp: session.protectIp });
    });
  }

  private onSocketError(payload: SocketErrorPayload): void {
    const event = payload.event;
    if (typeof event !== 'string' || !event.startsWith('call:')) {
      return;
    }
    const code = payload.code ?? 'call.error';
    const session = this.session;
    if (event === 'call:ice-servers' && session) {
      const pending = this.pendingIce.get(session.callId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingIce.delete(session.callId);
        pending.reject(new Error(code));
      }
      return;
    }
    if (event === 'call:start' && code === 'call.peerBusy' && !(session && this.machine.getState().phase === 'outgoing-ringing')) {
      return;
    }
    if (event === 'call:start' && session && this.machine.getState().phase === 'outgoing-ringing') {
      if (code !== 'call.peerBusy') {
        this.update({ notice: { kind: code === 'call.disabled' ? 'disabled' : 'server-error', code } });
      }
      this.machine.dispatch({
        type: 'failure',
        callId: session.callId,
        detail: code,
        reason: code === 'call.peerBusy' ? 'busy' : 'failed',
      });
      return;
    }
    if (event === 'call:accept') {
      if (session && session.role === 'callee') {
        this.machine.dispatch({ type: 'accept-rejected', callId: session.callId });
      }
      return;
    }
    if (event === 'call:hangup' || event === 'call:decline') {
      return;
    }
    this.update({ notice: { kind: 'server-error', code } });
  }

  private async onServerState(payload: CallStatePayload | null): Promise<void> {
    const state = this.machine.getState();
    if (payload === null) {
      if (state.callId && isCallLive(state) && !this.preparing) {
        this.machine.dispatch({ type: 'remote-ended', callId: state.callId, reason: hasCallMedia(state) ? 'connection-lost' : 'missed' });
      }
      return;
    }
    if (state.callId === payload.callId) {
      this.session?.peerSession?.restartIce();
      return;
    }
    if (isCallLive(state) || this.preparing) {
      return;
    }
    if (await this.deps.tabs.isCallHeldByOtherTab()) {
      return;
    }
    this.deps.socket.emit('call:hangup', { callId: payload.callId });
    this.update({ notice: { kind: 'interrupted' } });
  }

  private handleTabMessage(message: TabCallMessage): void {
    if (message.type === 'state') {
      this.update({ otherTab: message.info });
      return;
    }
    if (this.snapshot.otherTab?.callId === message.callId) {
      this.update({ otherTab: null });
    }
  }

  private handleEffect(effect: CallEffect): void {
    const session = this.session;
    switch (effect.type) {
      case 'send-start':
        if (session) {
          this.deps.socket.emit('call:start', { callId: session.callId, roomId: session.roomId, kind: session.kind, envelope: session.envelope });
          this.startHeartbeat(session.callId);
        }
        return;
      case 'send-accept':
        if (session) {
          this.deps.socket.emit('call:accept', { callId: session.callId, envelope: session.envelope });
          this.startHeartbeat(session.callId);
        }
        return;
      case 'send-decline':
        this.deps.socket.emit('call:decline', { callId: effect.callId });
        return;
      case 'send-hangup':
        this.deps.socket.emit('call:hangup', { callId: effect.callId });
        return;
      case 'create-peer':
        if (session) {
          void this.createPeer(session);
        }
        return;
      case 'start-ringtone':
        void this.deps.tabs.claimRingtone().then((claimed) => {
          if (claimed && this.machine.getState().phase === 'incoming-ringing') {
            this.deps.startRingtone('incoming');
          } else if (claimed) {
            this.deps.tabs.releaseRingtone();
          }
        });
        return;
      case 'stop-ringtone':
        this.deps.stopRingtone();
        this.deps.tabs.releaseRingtone();
        return;
      case 'close-peer':
        return;
    }
  }

  private async createPeer(session: Session): Promise<void> {
    let result: CallIceServersResult | null = null;
    try {
      result = await this.requestIce(session);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'call.error';
      if (session.protectIp || code === 'call.relayUnavailable') {
        this.update({ notice: { kind: 'relay-unavailable', code } });
        this.machine.dispatch({ type: 'failure', callId: session.callId, detail: 'relay-unavailable' });
        return;
      }
    }
    if (this.session !== session) {
      return;
    }
    const servers = result ? toIceServers(result) : [];
    const iceServers = servers.length > 0 ? servers : [FALLBACK_STUN];
    const degrade = toDegrade(result?.degrade);
    const peerSession = this.deps.createPeerSession({
      role: session.role,
      kind: session.kind,
      protectIp: session.protectIp,
      mobile: this.deps.isMobile(),
      iceServers,
      degrade,
      localStream: session.media?.stream ?? null,
      sendSignal: (type, payload) => this.sendSignal(session, type, payload),
      refreshIceServers: async () => {
        try {
          const refreshed = await this.requestIce(session);
          return refreshed ? { iceServers: toIceServers(refreshed), degrade: toDegrade(refreshed.degrade) } : null;
        } catch {
          return null;
        }
      },
      onConnection: (status) => this.machine.dispatch({ type: 'media', callId: session.callId, status, at: this.deps.now() }),
      onFatal: (detail) => this.machine.dispatch({ type: 'failure', callId: session.callId, detail }),
      onRemoteStream: (stream) => this.update({ remoteStream: stream }),
      onControl: (message) => this.handleControl(session, message),
      onDegrade: (step) => this.update({ degrade: step }),
    });
    session.peerSession = peerSession;
    peerSession.start();
    const queued = session.pendingSignals.splice(0);
    for (const signal of queued) {
      void peerSession.receiveSignal(signal.type, signal.payload);
    }
    if (session.kind === 'video') {
      this.deps.acquireWakeLock();
    }
    this.startStats(session);
  }

  private handleControl(session: Session, message: ControlMessage): void {
    if (this.session !== session) {
      return;
    }
    if (message.t === 'hangup') {
      this.machine.dispatch({ type: 'hangup-local', callId: session.callId });
    } else if (message.t === 'mute') {
      this.update({ remoteMuted: message.on });
    } else {
      this.update({ remoteCameraOn: message.on });
    }
  }

  private startHeartbeat(callId: string): void {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => this.deps.socket.emit('call:heartbeat', { callId }), HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat !== null) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  private startStats(session: Session): void {
    this.stopStats();
    this.statsTimer = setInterval(() => {
      const peer = session.peerSession;
      if (!peer || this.session !== session || this.machine.getState().phase !== 'active') {
        return;
      }
      void peer
        .getStats()
        .then((report) => {
          const reading = readQuality(report, session.statsSample);
          session.statsSample = reading.sample;
          if (this.session === session) {
            this.update({ quality: reading.bars });
          }
        })
        .catch(() => undefined);
    }, STATS_INTERVAL_MS);
  }

  private stopStats(): void {
    if (this.statsTimer !== null) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  }

  private handleChange(state: CallState): void {
    const previous = this.lastPhase;
    this.lastPhase = state.phase;
    const patch: Partial<CallSnapshot> = { state };
    if (state.phase === 'ended' && previous !== 'ended') {
      patch.durationSeconds = state.connectedAt === null ? null : Math.max(0, Math.round((this.deps.now() - state.connectedAt) / 1000));
      this.teardown(state);
    } else if (state.phase === 'idle') {
      Object.assign(patch, { muted: false, cameraOn: false, cameraFailed: false, remoteMuted: false, remoteCameraOn: false, quality: null, degrade: null, localStream: null, remoteStream: null, durationSeconds: null });
    }
    if (state.phase === 'outgoing-ringing' && previous !== 'outgoing-ringing') {
      void this.deps.tabs.claimRingtone().then((claimed) => {
        if (claimed && this.machine.getState().phase === 'outgoing-ringing') {
          this.deps.startRingtone('outgoing');
        }
      });
    }
    if (previous === 'outgoing-ringing' && state.phase !== 'outgoing-ringing') {
      this.deps.stopRingtone();
      this.deps.tabs.releaseRingtone();
    }
    this.update(patch);
    if (state.callId && state.peerId && state.kind && isCallLive(state)) {
      this.deps.tabs.announce({ callId: state.callId, peerId: state.peerId, kind: state.kind, phase: state.phase });
    }
  }

  private teardown(state: CallState): void {
    const session = this.session;
    this.session = null;
    this.stopHeartbeat();
    this.stopStats();
    this.deps.stopRingtone();
    this.deps.tabs.releaseRingtone();
    this.deps.releaseWakeLock();
    const pending = state.callId ? this.pendingIce.get(state.callId) : undefined;
    if (pending && state.callId) {
      clearTimeout(pending.timer);
      this.pendingIce.delete(state.callId);
      pending.resolve(null);
    }
    if (session) {
      session.peerSession?.close();
      session.channel?.dispose();
      if (session.ownEk) {
        zeroEphemeralKeyPair(session.ownEk);
      }
      this.deps.stopMedia(session.media?.stream ?? null);
      this.deps.tabs.announceReleased(session.callId);
    }
    this.deps.tabs.releaseCall();
    this.update({ localStream: null, remoteStream: null, quality: null });
  }

  dismissEnded(): void {
    this.machine.dispatch({ type: 'dismiss' });
  }

  dispose(): void {
    this.disposed = true;
    this.machine.dispose();
    this.stopHeartbeat();
    this.stopStats();
    for (const undo of this.detach.splice(0)) {
      undo();
    }
    const state = this.machine.getState();
    if (state.callId && isCallLive(state)) {
      this.deps.socket.emit('call:hangup', { callId: state.callId });
    }
    this.session?.peerSession?.close();
    this.session?.channel?.dispose();
    if (this.session?.ownEk) {
      zeroEphemeralKeyPair(this.session.ownEk);
    }
    this.deps.stopMedia(this.session?.media?.stream ?? null);
    this.deps.stopRingtone();
    this.deps.tabs.releaseRingtone();
    this.deps.tabs.releaseCall();
    this.deps.releaseWakeLock();
    this.session = null;
    this.listeners.clear();
  }
}

export const EMPTY_CALL_SNAPSHOT: CallSnapshot = initialSnapshot();
