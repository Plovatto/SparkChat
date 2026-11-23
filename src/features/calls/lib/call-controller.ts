import {
  SignalChannel,
  createAcceptEnvelope,
  createInviteEnvelope,
  createTransferAcceptEnvelope,
  createTransferEnvelope,
  deriveSessionKeys,
  generateEphemeralKeyPair,
  newCallId,
  newDeviceId,
  openAcceptEnvelope,
  openInviteEnvelope,
  openTransferAcceptEnvelope,
  openTransferEnvelope,
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
import { watchCpuPressure, type PressureWatch } from './cpu-pressure';
import { LoadAdapter, type LoadLevel } from './load-adaptation';
import { nextInstability, nextRelay, readQuality, RELAY_UNKNOWN, selectedPairRelayed, STABLE, type RelayState, STATS_INTERVAL_MS, type InstabilityState, type QualityBars, type QualitySample } from './call-stats';
import type { LocalMedia } from './media-devices';
import { onPageResume } from './page-resume';
import type { ConnectionStatus, ControlMessage, DegradeStep, IceRefresh, RestartReason, ScreenInfo } from './peer-session';
import type { ShareAudio } from './share-audio';
import { describeShareSurface, type ShareSurfaceKind } from './share-surface';
import type { TabCallInfo, TabCallMessage, TabOwnership } from './tab-ownership';
import type { VoiceLeveler } from './voice-leveler';

export const HEARTBEAT_INTERVAL_MS = 10_000;
export const OTHER_DEVICE_RECHECK_MS = 15_000;
export const HANGUP_RETRY_MS = 25_000;
export const ICE_SERVERS_TIMEOUT_MS = 8_000;
export const ICE_RETRY_DELAYS_MS: readonly number[] = [300, 600, 1200, 2400, 4800];
export const ACCEPT_CONFIRM_TIMEOUT_MS = 15_000;
export const CALL_RECONNECT_MAX_MS = 180_000;
export const CALL_OFFLINE_MAX_MS = CALL_RECONNECT_MAX_MS;
export const ROOM_WAIT_ATTEMPTS = 30;
export const ROOM_WAIT_INTERVAL_MS = 100;
export const NOTIFICATION_ACTION_TTL_MS = 60_000;
export const GLARE_WINDOW_MS = 15_000;
export const FALLBACK_STUN: RTCIceServer = { urls: 'stun:stun.cloudflare.com:3478' };
const MAX_KNOWN_CALL_IDS = 200;
const END_REASONS: ReadonlySet<string> = new Set(['completed', 'missed', 'declined', 'cancelled', 'busy', 'failed', 'connection-lost']);
const PORT_53 = /:53(?:\?|$)/;

export type CallNoticeKind =
  | 'media-denied'
  | 'media-busy'
  | 'no-microphone'
  | 'camera-degraded'
  | 'key-changed'
  | 'unverifiable'
  | 'other-tab'
  | 'disabled'
  | 'interrupted'
  | 'server-error'
  | 'screen-degraded'
  | 'transferred'
  | 'transfer-failed'
  | 'screen-failed';

export interface CallNotice {
  kind: CallNoticeKind;
  code?: string;
}

function isRingingForMe(payload: CallStatePayload): boolean {
  return payload.state === 'ringing' && payload.role === 'callee';
}

export interface CallSnapshot {
  state: CallState;
  enabled: boolean;
  muted: boolean;
  cameraOn: boolean;
  cameraFailed: boolean;
  remoteMuted: boolean;
  remoteCameraOn: boolean;
  screenSharing: boolean;
  canShareScreen: boolean;
  localScreenStream: MediaStream | null;
  remoteScreenOn: boolean;
  remoteScreenStream: MediaStream | null;
  remoteScreenSurface: ShareSurfaceKind | null;
  remoteScreenLabel: string | null;
  remoteScreenAudio: boolean;
  shareAudio: boolean;
  shareVolume: number;
  movieMode: boolean;
  remoteScreenMovie: boolean;
  remoteScreenPaused: boolean;
  screenPaused: boolean;
  unstable: boolean;
  quality: QualityBars | null;
  relayed: boolean | null;
  restartCount: number;
  lastRestartReason: RestartReason | null;
  degrade: DegradeStep | null;
  notice: CallNotice | null;
  otherTab: TabCallInfo | null;
  otherDevice: OtherDeviceCall | null;
  transferring: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  durationSeconds: number | null;
}

export interface PeerSessionLike {
  start: () => void;
  receiveSignal: (type: SignalType, payload: Record<string, unknown>) => Promise<void>;
  restartIce: () => void;
  recoverIfUnhealthy: (reason: 'online' | 'resync') => void;
  sendControl: (message: ControlMessage) => boolean;
  setMuted: (muted: boolean) => void;
  setVideoTrack: (track: MediaStreamTrack | null) => Promise<boolean | void>;
  setAudioTrack: (track: MediaStreamTrack) => Promise<void>;
  canShareScreen: () => boolean;
  setScreenTracks: (video: MediaStreamTrack | null, audio?: MediaStreamTrack | null, info?: ScreenInfo | null) => Promise<boolean>;
  updateScreenInfo: (info: ScreenInfo) => boolean;
  setMovieMode: (movie: boolean) => Promise<void>;
  setNetworkUnstable: (unstable: boolean) => Promise<void>;
  applyDegrade: (step: DegradeStep | null) => Promise<void>;
  refreshBandwidth?: () => Promise<void>;
  setLoadLevel?: (level: LoadLevel) => Promise<void>;
  requestScreenKeyFrame?: () => boolean;
  getStats: () => Promise<RTCStatsReport>;
  isIceHealthy: () => boolean;
  dropRelayCredentials: () => void;
  close: () => void;
}

export interface PeerSessionFactoryOptions {
  role: 'caller' | 'callee';
  kind: CallKind;
  mobile: boolean;
  iceServers: RTCIceServer[];
  degrade: DegradeStep | null;
  localStream: MediaStream | null;
  sendSignal: (type: SignalType, payload: Record<string, unknown>) => void;
  refreshIceServers: () => Promise<IceRefresh | null>;
  onConnection: (status: ConnectionStatus) => void;
  onFatal: (detail: string) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onRemoteScreen: (stream: MediaStream) => void;
  onControl: (message: ControlMessage) => void;
  onDegrade: (step: DegradeStep | null) => void;
  onRestart: (reason: RestartReason, relay: boolean) => void;
  canProbeDirect: () => boolean;
}

export type ResolvedPeer = { peer: PinnedPeer } | { error: 'key-changed' | 'unverifiable' };

export interface CallSocket {
  connected?: boolean;
  connect?: () => unknown;
  on: (event: string, handler: (...args: never[]) => void) => unknown;
  off: (event: string, handler: (...args: never[]) => void) => unknown;
  emit: (event: string, ...args: unknown[]) => unknown;
}

export interface CallControllerDeps {
  socket: CallSocket;
  onPageResume?: (handler: () => void) => () => void;
  isPageHidden?: () => boolean;
  getIdentity: () => CurrentIdentity | null;
  resolvePeer: (userId: string) => Promise<ResolvedPeer>;
  isPrivateRoomWith: (roomId: string, selfId: string, peerId: string) => boolean;
  tabs: TabOwnership;
  acquireMedia: (kind: CallKind) => Promise<LocalMedia>;
  acquireCamera: () => Promise<MediaStreamTrack | null>;
  acquireMicrophone?: () => Promise<MediaStreamTrack | null>;
  acquireScreen: () => Promise<MediaStream | null>;
  createShareAudio: (track: MediaStreamTrack, volume: number) => ShareAudio;
  getShareVolume: () => number;
  saveShareVolume: (volume: number) => number;
  getMovieMode: () => boolean;
  saveMovieMode: (movie: boolean) => boolean;
  applyShareConstraints: (stream: MediaStream, movie: boolean) => Promise<void>;
  stopMedia: (stream: MediaStream | null) => void;
  createPeerSession: (options: PeerSessionFactoryOptions) => PeerSessionLike;
  createVoiceLeveler?: (track: MediaStreamTrack) => VoiceLeveler;
  watchPressure?: () => PressureWatch;
  isMobile: () => boolean;
  startRingtone: (pattern: 'incoming' | 'outgoing') => void;
  stopRingtone: () => void;
  acquireWakeLock: () => void;
  releaseWakeLock: () => void;
  now: () => number;
  tabDevice?: () => string;
}

export interface NotificationCallAction {
  type: 'answer' | 'decline';
  callId: string;
}

export interface OtherDeviceCall {
  callId: string;
  peerId: string;
  kind: CallKind;
  roomId: string;
  role: 'caller' | 'callee';
  answeredAt: string | null;
  media?: CallMediaState | null;
}

export interface CallMediaState {
  muted: boolean;
  camera: boolean;
}

function readMediaState(value: unknown): CallMediaState | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const { muted, camera } = value as Record<string, unknown>;
  return typeof muted === 'boolean' && typeof camera === 'boolean' ? { muted, camera } : null;
}

interface RawSignal {
  callId: string;
  from: string;
  envelope: string;
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
  handledAccept: boolean;
  acceptConfirmed: boolean;
  acceptWaiters: Array<() => void>;
  statsSample: QualitySample | null;
  relay: RelayState;
  screen: MediaStream | null;
  screenPending: boolean;
  shareAudio: ShareAudio | null;
  screenInfo: ScreenInfo | null;
  screenPaused: boolean;
  screenDetached: boolean;
  screenCleanup: (() => void) | null;
  instability: InstabilityState;
  load: LoadAdapter;
  transferDeviceId: string | null;
  rawSignals: RawSignal[];
  seenTransfers: Set<string>;
}

interface PendingIce {
  resolve: (result: CallIceServersResult | null) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export const SURFACE_WATCH_MS = 2_000;

function withMovie(info: ScreenInfo | null, movie: boolean): ScreenInfo | null {
  return info ? { ...info, movie } : null;
}

function toScreenInfo(stream: MediaStream): ScreenInfo | null {
  try {
    const surface = describeShareSurface(stream);
    return surface ? { surface: surface.kind, label: surface.label } : null;
  } catch {
    return null;
  }
}

export function mediaErrorNotice(error: unknown): CallNoticeKind {
  const name = error instanceof Error || (typeof error === 'object' && error !== null && 'name' in error) ? String((error as { name?: unknown }).name) : '';
  if (name === 'NotReadableError' || name === 'AbortError' || name === 'TrackStartError') {
    return 'media-busy';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return 'no-microphone';
  }
  return 'media-denied';
}

export function sanitizeEndReason(reason: unknown): CallEndReason {
  return typeof reason === 'string' && END_REASONS.has(reason) ? (reason as CallEndReason) : 'failed';
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
    muted: false,
    cameraOn: false,
    cameraFailed: false,
    remoteMuted: false,
    remoteCameraOn: false,
    screenSharing: false,
    canShareScreen: false,
    localScreenStream: null,
    remoteScreenOn: false,
    remoteScreenStream: null,
    remoteScreenSurface: null,
    remoteScreenLabel: null,
    remoteScreenAudio: false,
    shareAudio: false,
    shareVolume: 1,
    movieMode: false,
    remoteScreenMovie: false,
    remoteScreenPaused: false,
    screenPaused: false,
    unstable: false,
    quality: null,
    relayed: null,
    restartCount: 0,
    lastRestartReason: null,
    degrade: null,
    notice: null,
    otherTab: null,
    otherDevice: null,
    transferring: false,
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
  private pressure: PressureWatch | null = null;
  private voiceLight = false;
  private voiceSwitching = false;
  private surfaceTimer: ReturnType<typeof setInterval> | null = null;
  private lastPhase = IDLE_CALL_STATE.phase;
  private reconnectingSince: number | null = null;
  private reconnectVerdict: string | null = null;
  private offlineSince: number | null = null;
  private disposed = false;
  private otherDeviceRecheck: ReturnType<typeof setTimeout> | null = null;
  private hangupRetries = new Map<string, ReturnType<typeof setTimeout>>();
  private retriedHangups = new Set<string>();
  private lastHangupCallId: string | null = null;
  private voice: VoiceLeveler | null = null;
  private deviceChain: Promise<void> = Promise.resolve();
  private cameraEpoch = 0;
  private pendingAnswer: { callId: string; until: number } | null = null;
  private readonly pendingDeclines = new Map<string, number>();
  private preparingPeerId: string | null = null;
  private glareInvite: Parameters<CallController['onIncoming']>[0] | null = null;
  private glarePeer: { peerId: string; until: number } | null = null;
  private readonly resumeAttempts = new Set<string>();

  constructor(deps: CallControllerDeps) {
    this.deps = deps;
    this.snapshot = { ...this.snapshot, movieMode: deps.getMovieMode() };
    this.machine = createCallMachine({
      onEffect: (effect) => this.handleEffect(effect),
      onChange: (state) => this.handleChange(state),
      extendReconnect: (state) => this.keepCallAlive(state, 'reconnecting'),
      extendConnect: (state) => this.keepCallAlive(state, 'connecting'),
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
      ['call:ended', (payload: { callId: string; reason: CallEndReason }) => this.onEnded(payload)],
      ['call:transferred', (payload: { callId: string }) => this.onTransferred(payload)],
      ['call:peer-transfer', (payload: { callId: string; from: string; envelope: string }) => this.onPeerTransfer(payload)],
      ['call:transfer-accepted', (payload: { callId: string; envelope: string }) => void this.onTransferAccepted(payload)],
      ['call:transfer-failed', (payload: { callId: string }) => this.onTransferFailed(payload)],
      ['call:state', (payload: CallStatePayload | null) => void this.onServerState(payload)],
      ['call:ice-servers-result', (payload: CallIceServersResult) => this.onIceResult(payload)],
      ['error', (payload: SocketErrorPayload) => this.onSocketError(payload)],
      ['connect', () => {
        this.offlineSince = null;
        this.requestSync();
      }],
      ['disconnect', () => this.noteOffline()],
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
    this.detach.push((this.deps.onPageResume ?? onPageResume)(() => this.resumeFromBackground()));
    if (typeof window !== 'undefined') {
      const online = () => this.onNetworkChange();
      window.addEventListener('online', online);
      this.detach.push(() => window.removeEventListener('online', online));
      const connection = (navigator as Navigator & { connection?: EventTarget }).connection;
      if (connection && typeof connection.addEventListener === 'function') {
        connection.addEventListener('change', online);
        this.detach.push(() => connection.removeEventListener('change', online));
      }
    }
  }

  private onEnded(payload: { callId: string; reason: CallEndReason }): void {
    if (this.snapshot.otherDevice?.callId === payload.callId) {
      this.update({ otherDevice: null });
    }
    this.machine.dispatch({ type: 'remote-ended', callId: payload.callId, reason: sanitizeEndReason(payload.reason) });
  }

  private requestSync(): void {
    const state = this.machine.getState();
    this.deps.socket.emit('call:sync', { callId: state.callId && isCallLive(state) ? state.callId : null, ...this.deviceField() });
  }

  private deviceField(): { device?: string } {
    const device = this.deps.tabDevice?.();
    return device ? { device } : {};
  }

  private outgoingPeer(): string | null {
    if (this.preparing && this.preparingPeerId) {
      return this.preparingPeerId;
    }
    const state = this.machine.getState();
    return state.phase === 'outgoing-ringing' && this.session?.role === 'caller' ? this.session.peerId : null;
  }

  private takeGlare(callerId: string): boolean {
    const glare = this.glarePeer;
    if (!glare || glare.peerId !== callerId) {
      return false;
    }
    this.glarePeer = null;
    return glare.until > this.deps.now();
  }

  private scheduleOtherDeviceRecheck(): void {
    this.clearOtherDeviceRecheck();
    for (const timer of this.hangupRetries.values()) {
      clearTimeout(timer);
    }
    this.hangupRetries.clear();
    this.otherDeviceRecheck = setTimeout(() => {
      this.otherDeviceRecheck = null;
      if (!this.disposed && this.snapshot.otherDevice) {
        this.requestSync();
        this.scheduleOtherDeviceRecheck();
      }
    }, OTHER_DEVICE_RECHECK_MS);
  }

  private retryHangup(callId: string): void {
    const state = this.machine.getState();
    if (this.retriedHangups.has(callId) || (state.callId === callId && isCallLive(state))) {
      return;
    }
    this.retriedHangups.add(callId);
    this.hangupRetries.set(
      callId,
      setTimeout(() => {
        this.hangupRetries.delete(callId);
        const current = this.machine.getState();
        if (!this.disposed && !(current.callId === callId && isCallLive(current))) {
          this.deps.socket.emit('call:hangup', { callId });
        }
      }, HANGUP_RETRY_MS),
    );
  }

  private clearOtherDeviceRecheck(): void {
    if (this.otherDeviceRecheck !== null) {
      clearTimeout(this.otherDeviceRecheck);
      this.otherDeviceRecheck = null;
    }
  }

  private onConfig(payload: CallConfigPayload): void {
    this.update({ enabled: payload.enabled === true });
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
      if (typeof payload.callerId === 'string' && payload.callerId === this.outgoingPeer()) {
        this.glareInvite = payload;
      }
      return;
    }
    if (typeof payload.callId !== 'string' || this.knownCallIds.has(payload.callId)) {
      return;
    }
    if (this.takePendingDecline(payload.callId)) {
      this.rememberCallId(payload.callId);
      return;
    }
    if (!(await this.waitForPrivateRoom(payload.roomId, identity.userId, payload.callerId))) {
      return;
    }
    if (this.preparing || isCallLive(this.machine.getState()) || this.knownCallIds.has(payload.callId)) {
      return;
    }
    this.preparing = true;
    let autoAnswer: boolean;
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
        handledAccept: false,
        acceptConfirmed: false,
        acceptWaiters: [],
        statsSample: null,
        relay: RELAY_UNKNOWN,
        screen: null,
        screenPending: false,
        shareAudio: null,
        screenInfo: null,
        screenPaused: false,
        screenDetached: false,
        screenCleanup: null,
        instability: STABLE,
        load: new LoadAdapter(),
        transferDeviceId: null,
        rawSignals: [],
        seenTransfers: new Set(),
      };
      this.machine.dispatch({ type: 'incoming', callId: content.callId, roomId: content.roomId, peerId: content.callerId, kind: content.kind });
      if (this.takePendingDecline(content.callId)) {
        this.pendingAnswer = null;
        this.decline();
        return;
      }
      autoAnswer = this.takePendingAnswer(content.callId) || this.takeGlare(content.callerId);
    } catch {
      return;
    } finally {
      this.preparing = false;
    }
    if (autoAnswer) {
      await this.accept();
    }
  }

  handleNotificationAction(action: NotificationCallAction): void {
    if (this.disposed || typeof action.callId !== 'string' || action.callId.length === 0) {
      return;
    }
    const state = this.machine.getState();
    const ringing = state.phase === 'incoming-ringing' && state.callId === action.callId;
    const until = this.deps.now() + NOTIFICATION_ACTION_TTL_MS;
    if (action.type === 'decline') {
      if (this.pendingAnswer?.callId === action.callId) {
        this.pendingAnswer = null;
      }
      if (ringing) {
        this.decline();
        return;
      }
      this.prunePendingDeclines();
      this.pendingDeclines.set(action.callId, until);
      this.deps.socket.emit('call:decline', { callId: action.callId });
      return;
    }
    if (ringing) {
      void this.accept();
      return;
    }
    if (isCallLive(state)) {
      return;
    }
    this.pendingAnswer = { callId: action.callId, until };
    this.requestSync();
  }

  private takePendingAnswer(callId: string): boolean {
    const pending = this.pendingAnswer;
    if (!pending || pending.callId !== callId) {
      return false;
    }
    this.pendingAnswer = null;
    return pending.until > this.deps.now();
  }

  private takePendingDecline(callId: string): boolean {
    this.prunePendingDeclines();
    return this.pendingDeclines.delete(callId);
  }

  private prunePendingDeclines(): void {
    const now = this.deps.now();
    for (const [callId, until] of this.pendingDeclines) {
      if (until <= now) {
        this.pendingDeclines.delete(callId);
      }
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
    this.preparing = true;
    this.preparingPeerId = input.peerId;
    this.glareInvite = null;
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
      } catch (error) {
        this.update({ notice: { kind: mediaErrorNotice(error) } });
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
        handledAccept: false,
        acceptConfirmed: false,
        acceptWaiters: [],
        statsSample: null,
        relay: RELAY_UNKNOWN,
        screen: null,
        screenPending: false,
        shareAudio: null,
        screenInfo: null,
        screenPaused: false,
        screenDetached: false,
        screenCleanup: null,
        instability: STABLE,
        load: new LoadAdapter(),
        transferDeviceId: null,
        rawSignals: [],
        seenTransfers: new Set(),
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
      this.preparingPeerId = null;
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
      } catch (error) {
        this.update({ notice: { kind: mediaErrorNotice(error) } });
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
    this.voice?.setMuted(next);
    peer?.setMuted(next);
    this.update({ muted: next });
    this.reportMediaChange();
  }

  setMicVolume(volume: number): void {
    this.voice?.setVolume(volume);
  }

  private levelVoice(stream: MediaStream | null): MediaStream | null {
    this.releaseVoice();
    const mic = stream?.getAudioTracks()[0];
    if (!stream || !mic || !this.deps.createVoiceLeveler) {
      return stream;
    }
    const voice = this.deps.createVoiceLeveler(mic);
    if (!voice.processed) {
      voice.close();
      return stream;
    }
    voice.setMuted(this.snapshot.muted);
    this.voice = voice;
    return voice.sendStream(stream);
  }

  private releaseVoice(): void {
    this.voice?.close();
    this.voice = null;
    this.voiceLight = false;
  }

  async toggleCamera(): Promise<void> {
    const session = this.session;
    const phase = this.machine.getState().phase;
    if (!session?.media || !session.peerSession || (phase !== 'active' && phase !== 'reconnecting')) {
      return;
    }
    const stream = session.media.stream;
    const peer = session.peerSession;
    const epoch = ++this.cameraEpoch;
    if (this.snapshot.cameraOn) {
      for (const track of stream.getVideoTracks()) {
        track.stop();
        stream.removeTrack(track);
      }
      this.update({ cameraOn: false, localStream: stream });
      this.reportMediaChange();
      await peer.setVideoTrack(null).catch(() => undefined);
      return;
    }
    const track = await this.deps.acquireCamera().catch(() => null);
    const stale = () => this.session !== session || session.peerSession !== peer || !this.isConnected() || this.cameraEpoch !== epoch;
    if (stale()) {
      track?.stop();
      return;
    }
    if (!track) {
      this.update({ cameraFailed: true });
      return;
    }
    let sent: boolean | void;
    try {
      sent = await peer.setVideoTrack(track);
    } catch {
      track.stop();
      if (!stale()) {
        this.update({ cameraOn: false, cameraFailed: true });
      }
      return;
    }
    if (sent === false) {
      track.stop();
      if (!stale()) {
        this.update({ cameraOn: false, notice: { kind: 'camera-degraded' } });
      }
      return;
    }
    if (stale()) {
      track.stop();
      if (this.session === session && session.peerSession === peer) {
        await peer.setVideoTrack(null).catch(() => undefined);
      }
      return;
    }
    stream.addTrack(track);
    this.update({ cameraOn: true, cameraFailed: false, localStream: stream });
    this.reportMediaChange();
  }

  async toggleScreenShare(): Promise<void> {
    if (this.session?.screen) {
      await this.stopScreenShare();
      return;
    }
    await this.startScreenShare();
  }

  private async startScreenShare(): Promise<void> {
    const session = this.session;
    const peer = session?.peerSession;
    if (!session || !peer || session.screen || session.screenPending || !this.isConnected() || !peer.canShareScreen()) {
      return;
    }
    if (this.snapshot.degrade === 'audio-only-relay') {
      this.update({ notice: { kind: 'screen-degraded' } });
      return;
    }
    session.screenPending = true;
    const stream = await this.deps.acquireScreen().catch(() => null);
    session.screenPending = false;
    if (!stream) {
      return;
    }
    const video = stream.getVideoTracks()[0];
    if (!video || this.session !== session || !this.isConnected()) {
      this.deps.stopMedia(stream);
      return;
    }
    let endedDuringSetup = false;
    const onEndedDuringSetup = () => {
      endedDuringSetup = true;
    };
    video.addEventListener('ended', onEndedDuringSetup, { once: true });
    const movie = this.deps.getMovieMode();
    let shareAudio: ShareAudio | null = null;
    let info: ScreenInfo | null = null;
    let ok: boolean;
    try {
      await this.deps.applyShareConstraints(stream, movie);
      await peer.setMovieMode(movie);
      const rawAudio = stream.getAudioTracks()[0] ?? null;
      const volume = this.deps.getShareVolume();
      shareAudio = rawAudio ? this.deps.createShareAudio(rawAudio, volume) : null;
      const described = withMovie(toScreenInfo(stream), movie);
      info = described ? { ...described, audio: shareAudio !== null } : null;
      ok = await peer.setScreenTracks(video, shareAudio?.track ?? null, info).catch(() => false);
    } catch {
      ok = false;
    } finally {
      video.removeEventListener('ended', onEndedDuringSetup);
    }
    const volume = this.deps.getShareVolume();
    if (ok && (endedDuringSetup || video.readyState === 'ended')) {
      shareAudio?.stop();
      this.deps.stopMedia(stream);
      await peer.setScreenTracks(null).catch(() => false);
      return;
    }
    if (!ok || this.session !== session || !this.isConnected()) {
      shareAudio?.stop();
      this.deps.stopMedia(stream);
      if (ok) {
        await peer.setScreenTracks(null);
      } else if (this.session === session) {
        this.update({ notice: { kind: this.getSnapshot().degrade === 'audio-only-relay' ? 'screen-degraded' : 'screen-failed' } });
      }
      return;
    }
    if (this.getSnapshot().degrade === 'audio-only-relay') {
      shareAudio?.stop();
      this.deps.stopMedia(stream);
      await peer.setScreenTracks(null);
      this.update({ notice: { kind: 'screen-degraded' } });
      return;
    }
    this.adoptScreen(session, stream, shareAudio, info);
    this.update({ screenSharing: true, localScreenStream: stream, shareAudio: shareAudio?.controllable ?? false, shareVolume: volume, movieMode: movie });
  }

  async setMovieMode(movie: boolean): Promise<void> {
    const saved = this.deps.saveMovieMode(movie);
    this.update({ movieMode: saved });
    const session = this.session;
    if (!session?.screen || !session.peerSession) {
      return;
    }
    await this.deps.applyShareConstraints(session.screen, saved);
    await session.peerSession.setMovieMode(saved);
    const info = withMovie(session.screenInfo ?? toScreenInfo(session.screen), saved);
    if (info) {
      session.screenInfo = info;
      session.peerSession.updateScreenInfo(info);
    }
  }

  setShareVolume(volume: number): void {
    const saved = this.deps.saveShareVolume(volume);
    this.session?.shareAudio?.setVolume(saved);
    this.update({ shareVolume: saved });
  }

  private setScreenPaused(session: Session, stream: MediaStream, paused: boolean): void {
    if (this.session !== session || session.screen !== stream || session.screenPaused === paused) {
      return;
    }
    session.screenPaused = paused;
    this.update({ screenPaused: paused });
    const base = session.screenInfo ?? toScreenInfo(stream) ?? { surface: 'unknown' as const, label: null };
    const rest: ScreenInfo = { surface: base.surface, label: base.label };
    if (base.audio !== undefined) {
      rest.audio = base.audio;
    }
    if (base.movie !== undefined) {
      rest.movie = base.movie;
    }
    session.screenInfo = paused ? { ...rest, paused: true } : rest;
    session.peerSession?.updateScreenInfo({ ...rest, paused });
  }

  private startSurfaceWatch(session: Session): void {
    this.stopSurfaceWatch();
    this.surfaceTimer = setInterval(() => {
      if (this.session !== session || !session.screen) {
        this.stopSurfaceWatch();
        return;
      }
      const described = withMovie(toScreenInfo(session.screen), this.snapshot.movieMode);
      const info = described ? { ...described, audio: session.shareAudio !== null, ...(session.screenPaused ? { paused: true } : {}) } : null;
      if (info && (info.surface !== session.screenInfo?.surface || info.label !== session.screenInfo.label)) {
        session.screenInfo = info;
        session.peerSession?.updateScreenInfo(info);
      }
    }, SURFACE_WATCH_MS);
  }

  private stopSurfaceWatch(): void {
    if (this.surfaceTimer !== null) {
      clearInterval(this.surfaceTimer);
      this.surfaceTimer = null;
    }
  }

  private releaseScreen(session: Session): void {
    const stream = session.screen;
    session.screen = null;
    session.screenInfo = null;
    session.shareAudio?.stop();
    session.shareAudio = null;
    session.screenCleanup?.();
    session.screenCleanup = null;
    session.screenPaused = false;
    this.stopSurfaceWatch();
    this.deps.stopMedia(stream);
  }

  async stopScreenShare(): Promise<void> {
    const session = this.session;
    const stream = session?.screen;
    if (!session || !stream) {
      return;
    }
    this.releaseScreen(session);
    this.update({ screenSharing: false, localScreenStream: null, shareAudio: false, screenPaused: false });
    await session.peerSession?.setScreenTracks(null);
  }

  private isConnected(): boolean {
    const phase = this.machine.getState().phase;
    return phase === 'active' || phase === 'reconnecting';
  }

  private queueDeviceChange(task: () => Promise<void>): Promise<void> {
    const next = this.deviceChain.then(task, task);
    this.deviceChain = next.catch(() => undefined);
    return next;
  }

  switchCamera(): Promise<void> {
    return this.queueDeviceChange(() => this.swapCamera());
  }

  switchMicrophone(): Promise<void> {
    const acquire = this.deps.acquireMicrophone;
    if (!acquire) {
      return Promise.resolve();
    }
    return this.queueDeviceChange(async () => {
      const session = this.session;
      if (!session?.media || !session.peerSession) {
        return;
      }
      const track = await acquire().catch(() => null);
      if (track) {
        await this.installAudioInput(session, track);
      }
    });
  }

  private async swapCamera(): Promise<void> {
    const session = this.session;
    const peer = session?.peerSession;
    if (!session?.media || !peer || !this.isConnected() || !this.snapshot.cameraOn) {
      return;
    }
    const stream = session.media.stream;
    const previous = stream.getVideoTracks();
    let track = await this.deps.acquireCamera().catch(() => null);
    if (!track && this.session === session) {
      for (const old of previous) {
        old.stop();
      }
      track = await this.deps.acquireCamera().catch(() => null);
    }
    if (this.session !== session || session.peerSession !== peer || !this.snapshot.cameraOn) {
      track?.stop();
      return;
    }
    const dropCamera = async () => {
      for (const old of previous) {
        old.stop();
        stream.removeTrack(old);
      }
      await peer.setVideoTrack(null).catch(() => undefined);
      this.update({ cameraOn: false, cameraFailed: true, localStream: stream });
      this.reportMediaChange();
    };
    if (!track) {
      await dropCamera();
      return;
    }
    try {
      await peer.setVideoTrack(track);
    } catch {
      track.stop();
      if (previous.some((old) => old.readyState === 'ended') && this.session === session) {
        await dropCamera();
      }
      return;
    }
    if (this.session !== session) {
      track.stop();
      return;
    }
    for (const old of previous) {
      stream.removeTrack(old);
      if (old.readyState !== 'ended') {
        old.stop();
      }
    }
    stream.addTrack(track);
    this.update({ cameraOn: true, cameraFailed: false, localStream: stream });
  }

  private async installAudioInput(session: Session, track: MediaStreamTrack): Promise<void> {
    const peer = session.peerSession;
    if (this.session !== session || !session.media || !peer) {
      track.stop();
      return;
    }
    const stream = session.media.stream;
    const previous = stream.getAudioTracks();
    track.enabled = !this.snapshot.muted;
    const voice = this.voice;
    try {
      const leveled = voice ? voice.setInput(track) : track;
      await peer.setAudioTrack(this.voiceLight ? track : leveled);
    } catch {
      track.stop();
      const restore = previous.find((old) => old.readyState !== 'ended');
      if (voice && restore && this.voice === voice) {
        voice.setInput(restore);
      }
      return;
    }
    if (this.session !== session) {
      track.stop();
      return;
    }
    for (const old of previous) {
      stream.removeTrack(old);
      old.stop();
    }
    stream.addTrack(track);
    this.update({ localStream: stream });
  }

  async replaceAudioInput(track: MediaStreamTrack): Promise<void> {
    const session = this.session;
    if (!session?.media || !session.peerSession) {
      track.stop();
      return;
    }
    await this.queueDeviceChange(() => this.installAudioInput(session, track));
  }

  async replaceVideoInput(track: MediaStreamTrack): Promise<void> {
    const session = this.session;
    if (!session?.media || !session.peerSession) {
      track.stop();
      return;
    }
    await this.queueDeviceChange(async () => {
      const peer = session.peerSession;
      if (this.session !== session || !session.media || !peer) {
        track.stop();
        return;
      }
      const stream = session.media.stream;
      const previous = stream.getVideoTracks();
      const epoch = this.cameraEpoch;
      try {
        await peer.setVideoTrack(track);
      } catch {
        track.stop();
        return;
      }
      if (this.session !== session || session.peerSession !== peer || this.cameraEpoch !== epoch) {
        track.stop();
        if (this.session === session && session.peerSession === peer && !this.snapshot.cameraOn) {
          await peer.setVideoTrack(null).catch(() => undefined);
        }
        return;
      }
      for (const old of previous) {
        stream.removeTrack(old);
        old.stop();
      }
      stream.addTrack(track);
      this.update({ cameraOn: true, cameraFailed: false, localStream: stream });
    });
  }

  async changeScreenSource(): Promise<void> {
    const session = this.session;
    const peer = session?.peerSession;
    const current = session?.screen;
    if (!session || !peer || !current || session.screenPending || !this.isConnected()) {
      return;
    }
    session.screenPending = true;
    let stream: MediaStream | null = null;
    let shareAudio: ShareAudio | null = null;
    let adopted = false;
    try {
      stream = await this.deps.acquireScreen().catch(() => null);
      const video = stream?.getVideoTracks()[0];
      const stillCurrent = () => this.session === session && session.screen === current && session.peerSession === peer && this.isConnected();
      const ended = () => video?.readyState === 'ended';
      if (!stream || !video || ended() || !stillCurrent()) {
        return;
      }
      const movie = this.snapshot.movieMode;
      await this.deps.applyShareConstraints(stream, movie);
      const rawAudio = stream.getAudioTracks()[0] ?? null;
      const volume = this.deps.getShareVolume();
      shareAudio = rawAudio ? this.deps.createShareAudio(rawAudio, volume) : null;
      const described = withMovie(toScreenInfo(stream), movie);
      const info = described ? { ...described, audio: shareAudio !== null } : null;
      if (!stillCurrent()) {
        return;
      }
      const ok = await peer.setScreenTracks(video, shareAudio?.track ?? null, info).catch(() => false);
      if (!ok) {
        return;
      }
      if (!stillCurrent()) {
        if (this.session === session && session.peerSession === peer && session.screen) {
          await peer.setScreenTracks(session.screen.getVideoTracks()[0] ?? null, session.shareAudio?.track ?? null, session.screenInfo).catch(() => false);
        }
        return;
      }
      this.releaseScreen(session);
      this.adoptScreen(session, stream, shareAudio, info);
      adopted = true;
      this.update({ screenSharing: true, screenPaused: false, localScreenStream: stream, shareAudio: shareAudio?.controllable ?? false, shareVolume: volume });
      if (ended()) {
        void this.stopScreenShare();
      }
    } catch {
      return;
    } finally {
      session.screenPending = false;
      if (!adopted) {
        shareAudio?.stop();
        if (stream) {
          this.deps.stopMedia(stream);
        }
      }
    }
  }

  private adoptScreen(session: Session, stream: MediaStream, shareAudio: ShareAudio | null, info: ScreenInfo | null): void {
    const video = stream.getVideoTracks()[0];
    session.screen = stream;
    session.shareAudio = shareAudio;
    session.screenInfo = info;
    this.startSurfaceWatch(session);
    if (!video) {
      return;
    }
    const onMute = () => this.setScreenPaused(session, stream, true);
    const onUnmute = () => this.setScreenPaused(session, stream, false);
    video.addEventListener('mute', onMute);
    video.addEventListener('unmute', onUnmute);
    session.screenCleanup = () => {
      video.removeEventListener('mute', onMute);
      video.removeEventListener('unmute', onUnmute);
    };
    video.addEventListener(
      'ended',
      () => {
        if (this.session === session && session.screen === stream) {
          void this.stopScreenShare();
        }
      },
      { once: true },
    );
  }

  private async onAccepted(payload: { callId: string; envelope: string; deviceId: string }): Promise<void> {
    const session = this.session;
    const identity = this.deps.getIdentity();
    if (session && session.role === 'callee' && session.callId === payload.callId) {
      this.confirmAccept(session);
      return;
    }
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
    if (session && session.callId === payload.callId && !session.channel && session.transferDeviceId !== null) {
      if (session.rawSignals.length < 64) {
        session.rawSignals.push(payload);
      }
      return;
    }
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
    const previous = this.pendingIce.get(session.callId);
    if (previous) {
      clearTimeout(previous.timer);
      this.pendingIce.delete(session.callId);
      previous.resolve(null);
    }
    return new Promise<CallIceServersResult | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingIce.delete(session.callId);
        resolve(null);
      }, ICE_SERVERS_TIMEOUT_MS);
      this.pendingIce.set(session.callId, { resolve, reject, timer });
      this.deps.socket.emit('call:ice-servers', { callId: session.callId, protectIp: false });
    });
  }

  private onSocketError(payload: SocketErrorPayload): void {
    const event = payload.event;
    if (typeof event !== 'string' || !event.startsWith('call:')) {
      return;
    }
    const code = payload.code ?? 'call.error';
    const session = this.session;
    const errorCallId = payload.params?.callId;
    if (event === 'call:hangup' && code === 'call.notAllowed') {
      const refused = typeof errorCallId === 'string' ? errorCallId : this.lastHangupCallId;
      if (refused) {
        this.retryHangup(refused);
      }
      return;
    }
    if (typeof errorCallId === 'string' && errorCallId !== session?.callId) {
      return;
    }
    if (!session && (event === 'call:start' || event === 'call:ice-servers' || event === 'call:accept')) {
      return;
    }
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
      const invite = this.glareInvite?.callerId === session.peerId ? this.glareInvite : null;
      if ((invite && code === 'call.peerBusy') || code === 'call.alreadyInCall') {
        this.resolveGlare(session, invite);
        return;
      }
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
        if (code === 'call.invalidState' || code === 'call.notFound') {
          this.machine.dispatch({ type: 'accept-rejected', callId: session.callId });
        } else {
          this.update({ notice: { kind: 'server-error', code } });
          this.machine.dispatch({ type: 'failure', callId: session.callId, detail: code });
        }
      }
      return;
    }
    if (event === 'call:hangup' || event === 'call:decline') {
      return;
    }
    if (event === 'call:transfer') {
      if (session && session.transferDeviceId !== null) {
        this.onTransferFailed({ callId: session.callId });
      }
      return;
    }
    if (event === 'call:transfer-accept') {
      return;
    }
    if (event === 'call:heartbeat' || event === 'call:signal') {
      if (session) {
        this.requestSync();
      }
      return;
    }
    this.update({ notice: { kind: 'server-error', code } });
  }

  private resolveGlare(session: Session, invite: Parameters<CallController['onIncoming']>[0] | null): void {
    this.glareInvite = null;
    this.glarePeer = { peerId: session.peerId, until: this.deps.now() + GLARE_WINDOW_MS };
    this.machine.dispatch({ type: 'failure', callId: session.callId, detail: 'glare', reason: 'cancelled' });
    this.machine.dispatch({ type: 'dismiss' });
    queueMicrotask(() => {
      if (invite) {
        void this.onIncoming(invite);
      } else {
        this.requestSync();
      }
    });
  }

  private async onServerState(payload: CallStatePayload | null): Promise<void> {
    const state = this.machine.getState();
    if (payload === null) {
      if (this.snapshot.otherDevice) {
        this.update({ otherDevice: null });
      }
      if (state.callId && isCallLive(state) && !this.preparing) {
        this.machine.dispatch({ type: 'remote-ended', callId: state.callId, reason: hasCallMedia(state) ? 'connection-lost' : 'missed' });
      }
      return;
    }
    if (state.callId === payload.callId) {
      this.settleReconnectVerdict(payload);
      this.session?.peerSession?.recoverIfUnhealthy('resync');
      return;
    }
    if (isCallLive(state) || this.preparing || isRingingForMe(payload)) {
      return;
    }
    if (payload.state !== 'accepted' && payload.state !== 'active') {
      return;
    }
    if (payload.transferable === false) {
      if (this.snapshot.otherDevice) {
        this.update({ otherDevice: null });
      }
      return;
    }
    if (await this.deps.tabs.isCallHeldByOtherTab()) {
      return;
    }
    const other: OtherDeviceCall = { callId: payload.callId, peerId: payload.peerId, kind: payload.kind, roomId: payload.roomId, role: payload.role, answeredAt: payload.answeredAt ?? null, media: readMediaState(payload.media) };
    if (payload.resumable === true && !this.resumeAttempts.has(payload.callId) && !isCallLive(this.machine.getState()) && !this.preparing) {
      this.resumeAttempts.add(payload.callId);
      this.update({ otherDevice: other });
      await this.transferHere();
      return;
    }
    this.scheduleOtherDeviceRecheck();
    this.update({ otherDevice: other });
  }

  async transferHere(): Promise<void> {
    const other = this.snapshot.otherDevice;
    const identity = this.deps.getIdentity();
    if (!other || !identity || this.preparing || isCallLive(this.machine.getState())) {
      return;
    }
    this.preparing = true;
    this.update({ transferring: true, notice: null });
    let owned = false;
    let media: LocalMedia | null = null;
    let ek: EphemeralKeyPair | null = null;
    try {
      owned = await this.deps.tabs.claimCall();
      if (!owned) {
        this.update({ notice: { kind: 'other-tab' } });
        return;
      }
      const resolved = await this.deps.resolvePeer(other.peerId);
      if ('error' in resolved) {
        this.update({ notice: { kind: resolved.error } });
        return;
      }
      const carried = other.media;
      const mediaKind: CallKind = carried ? (carried.camera ? 'video' : 'voice') : other.kind;
      try {
        media = await this.deps.acquireMedia(mediaKind);
      } catch (error) {
        this.update({ notice: { kind: mediaErrorNotice(error) } });
        return;
      }
      ek = await generateEphemeralKeyPair();
      const deviceId = await newDeviceId();
      const envelope = await createTransferEnvelope({
        identity,
        peerPublicKey: resolved.peer.publicKey,
        peerId: other.peerId,
        callId: other.callId,
        role: other.role,
        deviceId,
        ek: ek.publicKey,
      });
      if (this.snapshot.otherDevice?.callId !== other.callId) {
        return;
      }
      this.session = {
        callId: other.callId,
        role: other.role,
        kind: other.kind,
        roomId: other.roomId,
        peerId: other.peerId,
        peer: resolved.peer,
        ownEk: ek,
        peerEk: null,
        envelope: '',
        channel: null,
        media,
        peerSession: null,
        pendingSignals: [],
        signalChain: Promise.resolve(),
        sendChain: Promise.resolve(),
        handledAccept: true,
        acceptConfirmed: true,
        acceptWaiters: [],
        statsSample: null,
        relay: RELAY_UNKNOWN,
        screen: null,
        screenPending: false,
        shareAudio: null,
        screenInfo: null,
        screenPaused: false,
        screenDetached: false,
        screenCleanup: null,
        instability: STABLE,
        load: new LoadAdapter(),
        transferDeviceId: deviceId,
        rawSignals: [],
        seenTransfers: new Set(),
      };
      const handedOver = media;
      media = null;
      ek = null;
      const answeredAt = other.answeredAt ? Date.parse(other.answeredAt) : Number.NaN;
      this.machine.dispatch({
        type: 'transfer-in',
        callId: other.callId,
        roomId: other.roomId,
        peerId: other.peerId,
        kind: other.kind,
        role: other.role,
        connectedAt: Number.isFinite(answeredAt) ? answeredAt : null,
      });
      const startMuted = carried?.muted === true;
      for (const track of handedOver.stream.getAudioTracks()) {
        track.enabled = !startMuted;
      }
      this.update({ otherDevice: null, muted: startMuted, cameraOn: handedOver.stream.getVideoTracks().length > 0, cameraFailed: handedOver.cameraFailed, localStream: handedOver.stream });
      this.deps.socket.emit('call:transfer', { callId: other.callId, envelope, ...this.deviceField() });
    } catch {
      this.update({ otherDevice: null, notice: { kind: 'transfer-failed' } });
      this.requestSync();
    } finally {
      this.preparing = false;
      this.update({ transferring: false });
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

  private async onTransferAccepted(payload: { callId: string; envelope: string }): Promise<void> {
    const session = this.session;
    const identity = this.deps.getIdentity();
    if (!session || !identity || session.callId !== payload.callId || session.transferDeviceId === null || session.channel || !session.ownEk) {
      return;
    }
    const content = await openTransferAcceptEnvelope({
      identity,
      sender: session.peer,
      expectedCallId: session.callId,
      expectedSenderId: session.peerId,
      expectedDeviceId: session.transferDeviceId,
      envelope: payload.envelope,
    });
    if (this.session !== session || !session.ownEk) {
      return;
    }
    if (!content) {
      return;
    }
    const keys = await deriveSessionKeys({
      role: session.role,
      callId: session.callId,
      callerPublicKey: session.role === 'caller' ? identity.publicKey : session.peer.publicKey,
      calleePublicKey: session.role === 'caller' ? session.peer.publicKey : identity.publicKey,
      ownEphemeral: session.ownEk,
      peerEphemeralPublicKey: content.ek,
    });
    zeroEphemeralKeyPair(session.ownEk);
    session.ownEk = null;
    if (this.session !== session) {
      keys.send.fill(0);
      keys.receive.fill(0);
      return;
    }
    session.channel = new SignalChannel({ callId: session.callId, selfId: identity.userId, peerId: session.peerId, keys });
    session.transferDeviceId = null;
    this.startHeartbeat(session.callId);
    const buffered = session.rawSignals.splice(0);
    for (const signal of buffered) {
      this.onSignal(signal);
    }
    await this.createPeer(session);
  }

  private onPeerTransfer(payload: { callId: string; from: string; envelope: string }): void {
    const session = this.session;
    if (!session || session.callId !== payload.callId) {
      return;
    }
    session.signalChain = session.signalChain.then(() => this.handlePeerTransfer(session, payload)).catch(() => undefined);
  }

  private async handlePeerTransfer(expected: Session, payload: { callId: string; from: string; envelope: string }): Promise<void> {
    const session = this.session;
    if (session !== expected) {
      return;
    }
    const identity = this.deps.getIdentity();
    const phase = this.machine.getState().phase;
    if (!session || !identity || session.callId !== payload.callId || payload.from !== session.peerId || !hasCallMedia(this.machine.getState()) || phase === 'connecting') {
      return;
    }
    const content = await openTransferEnvelope({
      identity,
      sender: session.peer,
      expectedCallId: session.callId,
      expectedSenderId: session.peerId,
      expectedSenderRole: session.role === 'caller' ? 'callee' : 'caller',
      envelope: payload.envelope,
    });
    if (!content || this.session !== session || session.seenTransfers.has(content.deviceId)) {
      return;
    }
    session.seenTransfers.add(content.deviceId);
    const ek = await generateEphemeralKeyPair();
    try {
      const keys = await deriveSessionKeys({
        role: session.role,
        callId: session.callId,
        callerPublicKey: session.role === 'caller' ? identity.publicKey : session.peer.publicKey,
        calleePublicKey: session.role === 'caller' ? session.peer.publicKey : identity.publicKey,
        ownEphemeral: ek,
        peerEphemeralPublicKey: content.ek,
      });
      const reply = await createTransferAcceptEnvelope({
        identity,
        peerPublicKey: session.peer.publicKey,
        peerId: session.peerId,
        callId: session.callId,
        deviceId: content.deviceId,
        ek: ek.publicKey,
      });
      if (this.session !== session) {
        keys.send.fill(0);
        keys.receive.fill(0);
        return;
      }
      session.peerSession?.close();
      session.peerSession = null;
      session.channel?.dispose();
      session.channel = new SignalChannel({ callId: session.callId, selfId: identity.userId, peerId: session.peerId, keys });
      session.pendingSignals = [];
      session.rawSignals = [];
      session.statsSample = null;
      session.relay = RELAY_UNKNOWN;
      session.instability = STABLE;
      session.screenDetached = session.screen !== null;
      this.machine.dispatch({ type: 'peer-transfer', callId: session.callId });
      this.update({ remoteStream: null, remoteMuted: false, remoteCameraOn: false, remoteScreenOn: false, remoteScreenStream: null, remoteScreenSurface: null, remoteScreenLabel: null, remoteScreenAudio: false, remoteScreenMovie: false, remoteScreenPaused: false, canShareScreen: false });
      this.deps.socket.emit('call:transfer-accept', { callId: session.callId, envelope: reply });
      void this.createPeer(session);
    } finally {
      zeroEphemeralKeyPair(ek);
    }
  }

  private onTransferFailed(payload: { callId: string }): void {
    const session = this.session;
    const state = this.machine.getState();
    if (!session || session.callId !== payload.callId || session.transferDeviceId === null) {
      return;
    }
    this.teardown(state);
    this.machine.dispatch({ type: 'transferred-away', callId: payload.callId });
    this.update({ notice: { kind: 'transfer-failed' } });
    this.requestSync();
  }

  private onTransferred(payload: { callId: string }): void {
    const session = this.session;
    const state = this.machine.getState();
    if (!session || session.callId !== payload.callId || !hasCallMedia(state)) {
      return;
    }
    this.teardown(state);
    this.machine.dispatch({ type: 'transferred-away', callId: payload.callId });
    this.update({ notice: { kind: 'transferred' } });
    this.requestSync();
  }

  endOtherDeviceCall(): void {
    const other = this.snapshot.otherDevice;
    if (!other) {
      return;
    }
    this.deps.socket.emit('call:hangup', { callId: other.callId, force: true });
    this.update({ otherDevice: null });
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
          this.deps.socket.emit('call:start', { callId: session.callId, roomId: session.roomId, kind: session.kind, envelope: session.envelope, ...this.deviceField() });
          this.startHeartbeat(session.callId);
        }
        return;
      case 'send-accept':
        if (session) {
          this.deps.socket.emit('call:accept', { callId: session.callId, envelope: session.envelope, ...this.deviceField() });
          this.startHeartbeat(session.callId);
        }
        return;
      case 'send-decline':
        this.deps.socket.emit('call:decline', { callId: effect.callId });
        return;
      case 'send-hangup':
        this.lastHangupCallId = effect.callId;
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

  private async waitForPrivateRoom(roomId: string, selfId: string, peerId: string): Promise<boolean> {
    for (let attempt = 0; attempt <= ROOM_WAIT_ATTEMPTS; attempt += 1) {
      if (this.deps.isPrivateRoomWith(roomId, selfId, peerId)) {
        return true;
      }
      if (attempt < ROOM_WAIT_ATTEMPTS) {
        await new Promise<void>((resolve) => setTimeout(resolve, ROOM_WAIT_INTERVAL_MS));
      }
    }
    return false;
  }

  private confirmAccept(session: Session): void {
    session.acceptConfirmed = true;
    for (const waiter of session.acceptWaiters.splice(0)) {
      waiter();
    }
  }

  private waitForAcceptConfirmation(session: Session): Promise<void> {
    if (session.role === 'caller' || session.acceptConfirmed) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ACCEPT_CONFIRM_TIMEOUT_MS);
      session.acceptWaiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private async requestIceWithRetry(session: Session): Promise<CallIceServersResult | null> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.requestIce(session);
      } catch (error) {
        const delay = ICE_RETRY_DELAYS_MS[attempt];
        if (!(error instanceof Error) || error.message !== 'call.invalidState' || delay === undefined) {
          throw error;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
        if (this.session !== session) {
          return null;
        }
      }
    }
  }

  private async createPeer(session: Session): Promise<void> {
    let result: CallIceServersResult | null;
    await this.waitForAcceptConfirmation(session);
    if (this.session !== session) {
      return;
    }
    try {
      result = await this.requestIceWithRetry(session);
    } catch {
      result = null;
      this.requestSync();
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
      mobile: this.deps.isMobile(),
      iceServers,
      degrade,
      localStream: this.levelVoice(session.media?.stream ?? null),
      sendSignal: (type, payload) => this.sendSignal(session, type, payload),
      refreshIceServers: async () => {
        try {
          const refreshed = await this.requestIce(session);
          return refreshed ? { iceServers: toIceServers(refreshed), degrade: toDegrade(refreshed.degrade) } : null;
        } catch {
          return null;
        }
      },
      onConnection: (status) => {
        this.machine.dispatch({ type: 'media', callId: session.callId, status, at: this.deps.now() });
        if (status === 'connected' && this.session === session && session.peerSession) {
          this.update({ canShareScreen: session.peerSession.canShareScreen() });
        }
      },
      onFatal: (detail) => this.machine.dispatch({ type: 'failure', callId: session.callId, detail }),
      onRemoteStream: (stream) => {
        if (this.session === session) {
          this.update({ remoteStream: stream });
        }
      },
      onRemoteScreen: (stream) => {
        if (this.session === session) {
          this.update({ remoteScreenStream: stream });
        }
      },
      onControl: (message) => this.handleControl(session, message),
      onDegrade: (step) => this.handleDegrade(session, step),
      onRestart: (reason) => {
        if (this.session === session) {
          session.relay = RELAY_UNKNOWN;
          this.update({ restartCount: this.snapshot.restartCount + 1, lastRestartReason: reason });
        }
      },
      canProbeDirect: () => this.session === session && this.machine.getState().phase === 'active' && this.snapshot.quality === 3 && !this.snapshot.unstable,
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
    } else if (message.t === 'screen') {
      this.update({ remoteScreenMovie: message.on && message.movie === true, remoteScreenAudio: message.on && message.audio === true, remoteScreenOn: message.on, remoteScreenPaused: message.on && message.paused === true, remoteScreenSurface: message.on ? (message.surface ?? null) : null, remoteScreenLabel: message.on ? (message.label ?? null) : null });
    } else if (message.t === 'caps') {
      this.update({ canShareScreen: session.peerSession?.canShareScreen() ?? false });
      if (session.screenDetached) {
        void this.reattachScreen(session);
      }
    } else if (message.t === 'camera') {
      this.update({ remoteCameraOn: message.on });
    }
  }

  private async reattachScreen(session: Session): Promise<void> {
    const peer = session.peerSession;
    const stream = session.screen;
    session.screenDetached = false;
    if (!peer || !stream) {
      return;
    }
    const video = stream.getVideoTracks()[0];
    const current = () => this.session === session && session.screen === stream && session.peerSession === peer;
    let ok = false;
    if (video && video.readyState !== 'ended' && peer.canShareScreen()) {
      await peer.setMovieMode(this.snapshot.movieMode).catch(() => undefined);
      if (!current()) {
        return;
      }
      ok = await peer.setScreenTracks(video, session.shareAudio?.track ?? null, session.screenInfo).catch(() => false);
    }
    if (!current()) {
      if (ok) {
        await peer.setScreenTracks(null).catch(() => false);
      }
      return;
    }
    if (!ok) {
      this.releaseScreen(session);
      this.update({ screenSharing: false, localScreenStream: null, shareAudio: false, screenPaused: false, notice: { kind: 'screen-failed' } });
    }
  }

  private handleDegrade(session: Session, step: DegradeStep | null): void {
    if (this.session !== session) {
      return;
    }
    this.update({ degrade: step });
    if (step === 'audio-only-relay' && session.screen) {
      this.releaseScreen(session);
      this.update({ screenSharing: false, localScreenStream: null, shareAudio: false, screenPaused: false, notice: { kind: 'screen-degraded' } });
    }
    if (step === 'audio-only-relay' && this.snapshot.cameraOn && session.media) {
      const stream = session.media.stream;
      for (const track of stream.getVideoTracks()) {
        track.stop();
        stream.removeTrack(track);
      }
      this.cameraEpoch += 1;
      this.update({ cameraOn: false, localStream: stream, notice: { kind: 'camera-degraded' } });
      this.reportMediaChange();
    }
  }

  private startHeartbeat(callId: string): void {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => this.sendHeartbeat(callId), HEARTBEAT_INTERVAL_MS);
  }

  private sendHeartbeat(callId: string): void {
    if (this.deps.socket.connected === false) {
      return;
    }
    const relayed = this.reportableRoute(callId);
    const media = this.reportableMedia(callId);
    this.deps.socket.emit('call:heartbeat', { callId, ...(relayed === null ? {} : { relayed }), ...(media ? { media } : {}), ...this.deviceField() });
    if (relayed === false) {
      this.session?.peerSession?.dropRelayCredentials();
    }
  }

  private reportableMedia(callId: string): CallMediaState | null {
    const session = this.session;
    if (!session || session.callId !== callId || !session.channel || !hasCallMedia(this.machine.getState())) {
      return null;
    }
    return { muted: this.snapshot.muted, camera: this.snapshot.cameraOn };
  }

  private reportMediaChange(): void {
    const session = this.session;
    if (session && this.heartbeat !== null && session.channel) {
      this.sendHeartbeat(session.callId);
    }
  }

  private reportableRoute(callId: string): boolean | null {
    const session = this.session;
    const peer = session?.peerSession;
    if (!session || !peer || session.callId !== callId || this.machine.getState().phase !== 'active' || !peer.isIceHealthy()) {
      return null;
    }
    return session.relay.pending === null ? session.relay.relayed : null;
  }

  private onNetworkChange(): void {
    const state = this.machine.getState();
    const peer = this.session?.peerSession;
    if (!state.callId || !isCallLive(state)) {
      return;
    }
    peer?.recoverIfUnhealthy('online');
    if (this.deps.socket.connected === false) {
      this.deps.socket.connect?.();
      return;
    }
    if (hasCallMedia(state)) {
      this.sendHeartbeat(state.callId);
    }
    this.requestSync();
  }

  private resumeFromBackground(): void {
    const state = this.machine.getState();
    if (!state.callId || !isCallLive(state)) {
      return;
    }
    const socket = this.deps.socket;
    if (socket.connected === false) {
      socket.connect?.();
    } else {
      this.sendHeartbeat(state.callId);
      this.requestSync();
    }
    this.session?.peerSession?.recoverIfUnhealthy('resync');
  }

  private stopHeartbeat(): void {
    if (this.heartbeat !== null) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  private startStats(session: Session): void {
    this.stopStats();
    this.pressure = (this.deps.watchPressure ?? watchCpuPressure)();
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
          const wasRelayed = session.relay.relayed;
          session.relay = nextRelay(session.relay, selectedPairRelayed(report));
          if (session.relay.relayed !== null && session.relay.relayed !== wasRelayed && this.heartbeat !== null && this.session === session) {
            this.sendHeartbeat(session.callId);
          }
          if (wasRelayed !== null && wasRelayed !== session.relay.relayed && session.screen && this.snapshot.movieMode) {
            void peer.setMovieMode(true);
          }
          if (this.session !== session) {
            return;
          }
          const wasUnstable = session.instability.unstable;
          session.instability = nextInstability(session.instability, Math.max(reading.lossRatio, reading.outboundLoss), this.deps.now());
          const unstable = session.instability.unstable;
          if (this.snapshot.quality !== reading.bars || this.snapshot.unstable !== unstable || this.snapshot.relayed !== session.relay.relayed) {
            this.update({ quality: reading.bars, unstable, relayed: session.relay.relayed });
          }
          if (unstable !== wasUnstable) {
            void peer.setNetworkUnstable(unstable);
          }
          this.adaptToLoad(session, peer, report);
          void peer.refreshBandwidth?.().catch(() => undefined);
        })
        .catch(() => undefined);
    }, STATS_INTERVAL_MS);
  }

  private stopStats(): void {
    if (this.statsTimer !== null) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
    this.pressure?.stop();
    this.pressure = null;
  }

  private adaptToLoad(session: Session, peer: PeerSessionLike, report: RTCStatsReport): void {
    const sharing = this.snapshot.remoteScreenOn && !this.snapshot.remoteScreenPaused;
    const shareTrackId = sharing ? (this.snapshot.remoteScreenStream?.getVideoTracks()[0]?.id ?? null) : null;
    const voiceTrackId = this.snapshot.remoteStream?.getAudioTracks()[0]?.id ?? null;
    const verdict = session.load.observe(report, { pressure: this.pressure?.current() ?? null, shareTrackId, voiceTrackId }, this.deps.now());
    void peer.setLoadLevel?.(verdict.level).catch(() => undefined);
    const voice = this.voice;
    const track = voice ? (verdict.light ? session.media?.stream.getAudioTracks()[0] : voice.track) : undefined;
    if (voice && track && verdict.light !== this.voiceLight && !this.voiceSwitching) {
      const light = verdict.light;
      this.voiceSwitching = true;
      if (!light) {
        voice.setLight(false);
      }
      void peer
        .setAudioTrack(track)
        .then(() => {
          if (this.voice === voice) {
            this.voiceLight = light;
            voice.setLight(light);
          }
        })
        .catch(() => {
          if (!light && this.voice === voice) {
            voice.setLight(true);
          }
        })
        .finally(() => {
          this.voiceSwitching = false;
        });
    }
    if (verdict.keyFrame) {
      peer.requestScreenKeyFrame?.();
    }
  }

  private noteOffline(): void {
    const state = this.machine.getState();
    if (state.callId && isCallLive(state)) {
      this.offlineSince ??= this.deps.now();
    }
  }

  private isOffline(): boolean {
    if (this.deps.socket.connected === false) {
      return true;
    }
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  private keepCallAlive(state: CallState, phase: 'connecting' | 'reconnecting'): boolean {
    if (!state.callId || state.phase !== phase || this.disposed) {
      return false;
    }
    const now = this.deps.now();
    if (this.isOffline()) {
      this.offlineSince ??= now;
      return now - this.offlineSince < CALL_OFFLINE_MAX_MS;
    }
    this.offlineSince = null;
    if (this.pageHidden()) {
      return true;
    }
    this.reconnectVerdict = state.callId;
    this.requestSync();
    this.session?.peerSession?.recoverIfUnhealthy('resync');
    return true;
  }

  private settleReconnectVerdict(payload: CallStatePayload): void {
    const state = this.machine.getState();
    if (this.reconnectVerdict !== payload.callId || state.callId !== payload.callId) {
      return;
    }
    this.reconnectVerdict = null;
    if ((state.phase !== 'reconnecting' && state.phase !== 'connecting') || payload.peerLive !== false) {
      return;
    }
    if (this.pageHidden() || this.isOffline()) {
      return;
    }
    this.machine.dispatch({ type: 'timeout', callId: payload.callId, timer: state.phase === 'connecting' ? 'connect' : 'reconnect' });
  }

  private pageHidden(): boolean {
    if (this.deps.isPageHidden) {
      return this.deps.isPageHidden();
    }
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
  }

  private handleChange(state: CallState): void {
    const previous = this.lastPhase;
    this.lastPhase = state.phase;
    if (state.phase === 'reconnecting' || state.phase === 'connecting') {
      this.reconnectingSince ??= this.deps.now();
    } else {
      this.reconnectingSince = null;
      this.reconnectVerdict = null;
      this.offlineSince = null;
    }
    const patch: Partial<CallSnapshot> = { state };
    if (state.phase === 'ended' && previous !== 'ended') {
      patch.durationSeconds = state.connectedAt === null ? null : Math.max(0, Math.round((this.deps.now() - state.connectedAt) / 1000));
      this.teardown(state);
    } else if (state.phase === 'idle') {
      Object.assign(patch, {
        muted: false,
        cameraOn: false,
        cameraFailed: false,
        remoteMuted: false,
        remoteCameraOn: false,
        screenSharing: false,
        canShareScreen: false,
        localScreenStream: null,
        remoteScreenOn: false,
        remoteScreenStream: null,
        remoteScreenSurface: null,
        remoteScreenLabel: null,
        remoteScreenAudio: false,
        remoteScreenMovie: false,
        remoteScreenPaused: false,
        screenPaused: false,
        shareAudio: false,
        unstable: false,
        quality: null,
        relayed: null,
        restartCount: 0,
        lastRestartReason: null,
        degrade: null,
        localStream: null,
        remoteStream: null,
        durationSeconds: null,
      });
    }
    if (state.phase === 'outgoing-ringing' && previous !== 'outgoing-ringing') {
      void this.deps.tabs.claimRingtone().then((claimed) => {
        if (claimed && this.machine.getState().phase === 'outgoing-ringing') {
          this.deps.startRingtone('outgoing');
        } else if (claimed) {
          this.deps.tabs.releaseRingtone();
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
      this.confirmAccept(session);
      session.peerSession?.close();
      session.channel?.dispose();
      if (session.ownEk) {
        zeroEphemeralKeyPair(session.ownEk);
      }
      this.deps.stopMedia(session.media?.stream ?? null);
      this.releaseVoice();
      this.releaseScreen(session);
      this.deps.tabs.announceReleased(session.callId);
    }
    this.deps.tabs.releaseCall();
    this.update({ localStream: null, remoteStream: null, quality: null, screenSharing: false, canShareScreen: false, localScreenStream: null, remoteScreenOn: false, remoteScreenStream: null, remoteScreenSurface: null, remoteScreenLabel: null, remoteScreenAudio: false, remoteScreenMovie: false, remoteScreenPaused: false, screenPaused: false, shareAudio: false, unstable: false, relayed: null });
  }

  dismissEnded(): void {
    this.machine.dispatch({ type: 'dismiss' });
  }

  dispose(): void {
    this.disposed = true;
    this.clearOtherDeviceRecheck();
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
    this.releaseVoice();
    if (this.session) {
      this.releaseScreen(this.session);
    }
    this.deps.stopRingtone();
    this.deps.tabs.releaseRingtone();
    this.deps.tabs.releaseCall();
    this.deps.releaseWakeLock();
    this.session = null;
    this.listeners.clear();
  }
}

export const EMPTY_CALL_SNAPSHOT: CallSnapshot = initialSnapshot();
