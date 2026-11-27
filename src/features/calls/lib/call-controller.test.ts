import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CallCryptoModule from '@lib/e2ee/call-crypto';
import type { PinnedPeer, SignalType } from '@lib/e2ee/call-crypto';
import type { CurrentIdentity } from '@lib/e2ee/current-identity';
import { generateIdentity } from '@lib/e2ee/identity';
import { buildSigningProof } from '@lib/e2ee/signing';
import { CALL_CONNECT_TIMEOUT_MS, CALL_RECONNECT_TIMEOUT_MS } from '../state/call-machine';
import {
  CALL_OFFLINE_MAX_MS,
  CALL_RECONNECT_MAX_MS,
  CallController,
  FALLBACK_STUN,
  HEARTBEAT_INTERVAL_MS,
  sanitizeEndReason,
  type CallControllerDeps,
  type CallSocket,
  type PeerSessionFactoryOptions,
  type PeerSessionLike,
  HANGUP_RETRY_MS,
  OTHER_DEVICE_RECHECK_MS,
  type ResolvedPeer,
} from './call-controller';
import { onPageResume, type ResumeSource } from './page-resume';
import { createTabOwnership } from './tab-ownership';
import type { VoiceLeveler } from './voice-leveler';

const derivedKeys = vi.hoisted(() => [] as Array<{ send: Uint8Array; receive: Uint8Array }>);

vi.mock('@lib/e2ee/call-crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof CallCryptoModule>();
  return {
    ...actual,
    deriveSessionKeys: async (input: Parameters<typeof actual.deriveSessionKeys>[0]) => {
      const keys = await actual.deriveSessionKeys(input);
      derivedKeys.push(keys);
      return keys;
    },
  };
});

type Handler = (...args: unknown[]) => void;

class FakeSocket implements CallSocket {
  connected = false;
  connects = 0;
  readonly handlers = new Map<string, Set<Handler>>();
  readonly emitted: Array<{ event: string; payload: Record<string, unknown> }> = [];
  onEmit: ((event: string, payload: Record<string, unknown>) => void) | null = null;

  on(event: string, handler: (...args: never[]) => void): this {
    const set = this.handlers.get(event) ?? new Set<Handler>();
    set.add(handler as Handler);
    this.handlers.set(event, set);
    return this;
  }

  off(event: string, handler: (...args: never[]) => void): this {
    this.handlers.get(event)?.delete(handler as Handler);
    return this;
  }

  connect(): this {
    this.connects += 1;
    return this;
  }

  emit(event: string, ...args: unknown[]): this {
    const payload = (args[0] ?? {}) as Record<string, unknown>;
    this.emitted.push({ event, payload });
    this.onEmit?.(event, payload);
    return this;
  }

  receive(event: string, payload: unknown): void {
    for (const handler of Array.from(this.handlers.get(event) ?? [])) {
      handler(payload);
    }
  }

  sent(event: string): Array<Record<string, unknown>> {
    return this.emitted.filter((entry) => entry.event === event).map((entry) => entry.payload);
  }
}

class FakePeer implements PeerSessionLike {
  started = false;
  closed = false;
  restarts = 0;
  received: Array<{ type: SignalType; payload: Record<string, unknown> }> = [];
  controls: unknown[] = [];
  muted: boolean | null = null;
  videoTrack: unknown = undefined;
  constructor(readonly options: PeerSessionFactoryOptions) {}
  start(): void {
    this.started = true;
  }
  receiveSignal(type: SignalType, payload: Record<string, unknown>): Promise<void> {
    this.received.push({ type, payload });
    return Promise.resolve();
  }
  restartIce(): void {
    this.restarts += 1;
  }
  recoveries: string[] = [];
  recoverIfUnhealthy(reason: string): void {
    this.recoveries.push(reason);
  }
  sendControl(message: unknown): boolean {
    this.controls.push(message);
    return true;
  }
  setMuted(muted: boolean): void {
    this.muted = muted;
  }
  setVideoTrack(track: MediaStreamTrack | null): Promise<void> {
    this.videoTrack = track;
    return Promise.resolve();
  }
  setAudioTrack(): Promise<void> {
    return Promise.resolve();
  }
  shareable = true;
  screenTracks: Array<{ video: unknown; audio: unknown }> = [];
  screenResult = true;
  unstableCalls: boolean[] = [];
  canShareScreen(): boolean {
    return this.shareable;
  }
  screenInfos: unknown[] = [];
  setScreenTracks(video: MediaStreamTrack | null, audio: MediaStreamTrack | null = null, info: unknown = null): Promise<boolean> {
    this.screenTracks.push({ video, audio });
    this.screenInfos.push(info);
    return Promise.resolve(this.screenResult);
  }
  movieCalls: boolean[] = [];
  setMovieMode(movie: boolean): Promise<void> {
    this.movieCalls.push(movie);
    return Promise.resolve();
  }
  updateScreenInfo(info: unknown): boolean {
    this.screenInfos.push(info);
    return true;
  }
  setNetworkUnstable(unstable: boolean): Promise<void> {
    this.unstableCalls.push(unstable);
    return Promise.resolve();
  }
  applyDegrade(): Promise<void> {
    return Promise.resolve();
  }
  loadLevels: number[] = [];
  setLoadLevel(level: number): Promise<void> {
    this.loadLevels.push(level);
    return Promise.resolve();
  }
  keyFrameRequests = 0;
  requestScreenKeyFrame(): boolean {
    this.keyFrameRequests += 1;
    return true;
  }
  statsReport: Map<string, Record<string, unknown>> = new Map();
  getStats(): Promise<RTCStatsReport> {
    return Promise.resolve(this.statsReport as unknown as RTCStatsReport);
  }
  iceHealthy = true;
  isIceHealthy(): boolean {
    return this.iceHealthy;
  }
  dropped = 0;
  dropRelayCredentials(): void {
    this.dropped += 1;
  }
  close(): void {
    this.closed = true;
  }
}

interface Party {
  userId: string;
  identity: CurrentIdentity;
  pinned: PinnedPeer;
}

async function makeParty(userId: string): Promise<Party> {
  const keys = await generateIdentity();
  const proof = await buildSigningProof(userId, keys.publicKey, keys.privateKey);
  return {
    userId,
    identity: { userId, publicKey: keys.publicKey, privateKey: keys.privateKey },
    pinned: { publicKey: keys.publicKey, signingPublicKey: proof.signingPublicKey },
  };
}

interface Node {
  socket: FakeSocket;
  controller: CallController;
  peers: FakePeer[];
  stopped: number;
  rings: string[];
  deps: CallControllerDeps;
}

function makeNode(self: Party, resolve: (userId: string) => Promise<ResolvedPeer>, overrides: Partial<CallControllerDeps> = {}): Node {
  const socket = (overrides.socket as FakeSocket | undefined) ?? new FakeSocket();
  const node = { socket, peers: [], stopped: 0, rings: [] } as unknown as Node;
  const deps: CallControllerDeps = {
    socket,
    getIdentity: () => self.identity,
    resolvePeer: resolve,
    isPrivateRoomWith: () => true,
    tabs: createTabOwnership({ locks: null, createChannel: () => null, tabId: self.userId }),
    acquireMedia: (kind) =>
      Promise.resolve({
        stream: {
          getTracks: () => [],
          getAudioTracks: () => [],
          getVideoTracks: () => (kind === 'video' ? [{}] : []),
        } as unknown as MediaStream,
        cameraFailed: false,
      }),
    acquireCamera: () => Promise.resolve(null),
    acquireScreen: () => Promise.resolve(null),
    createShareAudio: (track) => ({ track, controllable: false, setVolume: () => undefined, stop: () => undefined }),
    getShareVolume: () => 1,
    saveShareVolume: (volume) => volume,
    getMovieMode: () => false,
    saveMovieMode: (movie) => movie,
    applyShareConstraints: () => Promise.resolve(),
    stopMedia: () => {
      node.stopped += 1;
    },
    createPeerSession: (options) => {
      const peer = new FakePeer(options);
      node.peers.push(peer);
      return peer;
    },
    isMobile: () => false,
    startRingtone: (pattern) => node.rings.push(pattern),
    stopRingtone: () => node.rings.push('stop'),
    acquireWakeLock: () => undefined,
    releaseWakeLock: () => undefined,
    now: () => Date.now(),
    ...overrides,
  };
  node.deps = deps;
  node.controller = new CallController(deps);
  return node;
}

interface World {
  alice: Party;
  bob: Party;
  a: Node;
  b: Node;
  dropped: Array<{ event: string }>;
}

const SERVER_ICE = {
  iceServers: [{ urls: ['stun:s.example:3478', 'turn:t.example:3478', 'turn:t.example:53?transport=udp'], username: 'u', credential: 'c' }],
  expiresAt: 1,
  relayOnly: false,
};

async function world(overrides: { alice?: Partial<CallControllerDeps>; bob?: Partial<CallControllerDeps>; bobResolve?: (id: string) => Promise<ResolvedPeer> } = {}): Promise<World> {
  const alice = await makeParty('alice');
  const bob = await makeParty('bob');
  const a = makeNode(alice, () => Promise.resolve({ peer: bob.pinned }), overrides.alice);
  const b = makeNode(bob, overrides.bobResolve ?? (() => Promise.resolve({ peer: alice.pinned })), overrides.bob);
  const dropped: Array<{ event: string }> = [];

  const route = (from: Node, to: Node, fromId: string) => (event: string, payload: Record<string, unknown>) => {
    if (event === 'call:start') {
      to.socket.receive('call:incoming', { callId: payload.callId, roomId: payload.roomId, kind: payload.kind, callerId: fromId, envelope: payload.envelope, ringExpiresAt: 1 });
    } else if (event === 'call:accept') {
      to.socket.receive('call:accepted', { callId: payload.callId, envelope: payload.envelope, deviceId: 'server-device' });
      from.socket.receive('call:accepted', { callId: payload.callId, envelope: payload.envelope, deviceId: 'server-device' });
    } else if (event === 'call:signal') {
      to.socket.receive('call:signal', { callId: payload.callId, from: fromId, envelope: payload.envelope });
    } else if (event === 'call:ice-servers') {
      from.socket.receive('call:ice-servers-result', { callId: payload.callId, ...SERVER_ICE });
    } else if (event === 'call:hangup' || event === 'call:decline') {
      const reason = event === 'call:decline' ? 'declined' : 'completed';
      const ended = { callId: payload.callId, reason, endedAt: 1 };
      from.socket.receive('call:ended', ended);
      to.socket.receive('call:ended', ended);
    } else if (!['call:heartbeat', 'call:sync', 'call:silence'].includes(event)) {
      dropped.push({ event });
    }
  };
  a.socket.onEmit = route(a, b, 'alice');
  b.socket.onEmit = route(b, a, 'bob');
  a.socket.receive('call:config', { enabled: true, relayAvailable: true });
  b.socket.receive('call:config', { enabled: true, relayAvailable: true });
  return { alice, bob, a, b, dropped };
}

async function settle(): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    await vi.advanceTimersByTimeAsync(0);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function connectCall(w: World, kind: 'voice' | 'video' = 'voice'): Promise<void> {
  void w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind });
  await settle();
  void w.b.controller.accept();
  await settle();
}

describe('availability', () => {
  it('refuses to start while the server has not enabled calls and exposes the config', async () => {
    const alice = await makeParty('alice');
    const node = makeNode(alice, () => Promise.resolve({ error: 'unverifiable' }));

    await node.controller.startCall({ roomId: 'r', peerId: 'bob', kind: 'voice' });

    expect(node.controller.getSnapshot().notice).toEqual({ kind: 'disabled' });
    expect(node.socket.sent('call:start')).toHaveLength(0);
    node.socket.receive('call:config', { enabled: true, relayAvailable: false });
    expect(node.controller.getSnapshot()).toMatchObject({ enabled: true });
    expect(node.socket.sent('call:sync')).toHaveLength(0);
  });

  it('syncs on creation, connect and auth so a controller created after config still becomes enabled', async () => {
    const alice = await makeParty('alice');
    const socket = new FakeSocket();
    socket.connected = true;
    socket.onEmit = (event) => {
      if (event === 'call:sync') {
        socket.receive('call:config', { enabled: true, relayAvailable: true });
        socket.receive('call:state', null);
      }
    };
    const node = makeNode(alice, () => Promise.resolve({ error: 'unverifiable' }), { socket });

    expect(node.socket.sent('call:sync')).toHaveLength(1);
    expect(node.controller.getSnapshot()).toMatchObject({ enabled: true });

    socket.receive('connect', undefined);
    socket.receive('user:resumed', {});
    socket.receive('user:registered', {});
    expect(socket.sent('call:sync')).toHaveLength(4);
  });

  it('does not sync on creation while the socket is not connected', async () => {
    const alice = await makeParty('alice');
    const node = makeNode(alice, () => Promise.resolve({ error: 'unverifiable' }));

    expect(node.socket.sent('call:sync')).toHaveLength(0);
  });

  it('calls even when the server has no relay and never asks for relay-only ice', async () => {
    const w = await world();
    w.a.socket.receive('call:config', { enabled: true, relayAvailable: false });
    w.b.socket.receive('call:config', { enabled: true, relayAvailable: false });

    await connectCall(w);

    expect(w.a.socket.sent('call:start')).toHaveLength(1);
    expect(w.a.controller.getSnapshot().notice).toBeNull();
    expect('relayAvailable' in w.a.controller.getSnapshot()).toBe(false);
    for (const node of [w.a, w.b]) {
      const requests = node.socket.sent('call:ice-servers');
      expect(requests.length).toBeGreaterThan(0);
      expect(requests.every((request) => request.protectIp === false)).toBe(true);
      expect(node.peers[0]?.options).not.toHaveProperty('protectIp');
    }
  });
});

describe('trust and media gates', () => {
  it('does not ring when the contact key changed or cannot be verified', async () => {
    for (const error of ['key-changed', 'unverifiable'] as const) {
      const alice = await makeParty('alice');
      const node = makeNode(alice, () => Promise.resolve({ error }));
      node.socket.receive('call:config', { enabled: true, relayAvailable: true });

      await node.controller.startCall({ roomId: 'r', peerId: 'bob', kind: 'voice' });

      expect(node.controller.getSnapshot().notice).toEqual({ kind: error });
      expect(node.socket.sent('call:start')).toHaveLength(0);
      expect(node.controller.getSnapshot().state.phase).toBe('idle');
    }
  });

  it('reports a denied microphone and releases the tab lock', async () => {
    const w = await world({ alice: { acquireMedia: () => Promise.reject(new Error('denied')) } });

    await w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind: 'voice' });

    expect(w.a.controller.getSnapshot().notice).toEqual({ kind: 'media-denied' });
    expect(w.a.socket.sent('call:start')).toHaveLength(0);
  });

  it('refuses to place a call when another tab owns the call lock', async () => {
    const w = await world({ alice: { tabs: { ...createTabOwnership({ locks: null, createChannel: () => null, tabId: 'x' }), claimCall: () => Promise.resolve(false) } } });

    await w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind: 'voice' });

    expect(w.a.controller.getSnapshot().notice).toEqual({ kind: 'other-tab' });
    expect(w.a.socket.sent('call:start')).toHaveLength(0);
  });
});

describe('full call between two controllers', () => {
  it('rings, answers and negotiates only after the accept', async () => {
    const w = await world();

    void w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind: 'video' });
    await settle();

    expect(w.a.controller.getSnapshot().state.phase).toBe('outgoing-ringing');
    expect(w.b.controller.getSnapshot().state).toMatchObject({ phase: 'incoming-ringing', peerId: 'alice', kind: 'video', roomId: 'room-1' });
    expect(w.a.peers).toHaveLength(0);
    expect(w.b.peers).toHaveLength(0);
    expect(w.b.rings).toContain('incoming');
    expect(w.a.rings).toContain('outgoing');

    void w.b.controller.accept();
    await settle();

    expect(w.a.controller.getSnapshot().state.phase).toBe('connecting');
    expect(w.b.controller.getSnapshot().state.phase).toBe('connecting');
    expect(w.a.peers).toHaveLength(1);
    expect(w.b.peers).toHaveLength(1);
    expect(w.a.peers.every((peer) => peer.started)).toBe(true);
    expect(w.a.rings.at(-1)).toBe('stop');
    expect(w.dropped).toEqual([]);
  });

  it('strips port 53 urls and passes credentials to the peer session', async () => {
    const w = await world();
    await connectCall(w);

    const options = w.a.peers[0]!.options;

    expect(options.iceServers).toEqual([{ urls: ['stun:s.example:3478', 'turn:t.example:3478'], username: 'u', credential: 'c' }]);
    expect(options.role).toBe('caller');
    expect(w.b.peers[0]!.options.role).toBe('callee');
  });

  it('exchanges encrypted signals in both directions and rejects replays', async () => {
    const w = await world();
    await connectCall(w);
    const callerPeer = w.a.peers[0]!;
    const calleePeer = w.b.peers[0]!;

    callerPeer.options.sendSignal('offer', { description: { type: 'offer', sdp: 'v=0' } });
    await settle();
    calleePeer.options.sendSignal('answer', { description: { type: 'answer', sdp: 'v=0' } });
    await settle();

    expect(calleePeer.received.map((entry) => entry.type)).toEqual(['offer']);
    expect(callerPeer.received.map((entry) => entry.type)).toEqual(['answer']);

    const first = w.a.socket.sent('call:signal')[0]!;
    w.b.socket.receive('call:signal', { callId: first.callId, from: 'alice', envelope: first.envelope });
    await settle();
    expect(calleePeer.received).toHaveLength(1);
  });

  it('drops signals with the wrong sender, an unknown call id or garbage', async () => {
    const w = await world();
    await connectCall(w);
    const calleePeer = w.b.peers[0]!;
    w.a.peers[0]!.options.sendSignal('candidate', { candidate: { candidate: 'x' } });
    await settle();
    const sent = w.a.socket.sent('call:signal')[0]!;
    calleePeer.received.length = 0;

    w.b.socket.receive('call:signal', { callId: sent.callId, from: 'mallory', envelope: sent.envelope });
    w.b.socket.receive('call:signal', { callId: 'other', from: 'alice', envelope: sent.envelope });
    w.b.socket.receive('call:signal', { callId: sent.callId, from: 'alice', envelope: 'garbage' });
    await settle();

    expect(calleePeer.received).toHaveLength(0);
  });

  it('queues signals that arrive before the callee peer exists', async () => {
    const w = await world();
    void w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind: 'voice' });
    await settle();
    w.b.socket.onEmit = (event, payload) => {
      if (event === 'call:accept') {
        w.a.socket.receive('call:accepted', { callId: payload.callId, envelope: payload.envelope, deviceId: 'd' });
        w.b.socket.receive('call:accepted', { callId: payload.callId, envelope: payload.envelope, deviceId: 'd' });
      }
    };
    void w.b.controller.accept();
    await settle();
    w.a.peers[0]?.options.sendSignal('offer', { description: { type: 'offer', sdp: 'v=0' } });
    await settle();

    expect(w.b.peers).toHaveLength(0);
    w.b.socket.receive('call:ice-servers-result', { callId: w.b.controller.getSnapshot().state.callId, ...SERVER_ICE });
    await settle();

    expect(w.b.peers[0]?.received.map((entry) => entry.type)).toEqual(['offer']);
  });

  it('becomes active when media connects, tracks quality and reconnects', async () => {
    const w = await world();
    await connectCall(w);
    const peer = w.a.peers[0]!;

    peer.options.onConnection('connected');
    expect(w.a.controller.getSnapshot().state.phase).toBe('active');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(w.a.controller.getSnapshot().quality).toBe(3);

    peer.options.onConnection('interrupted');
    expect(w.a.controller.getSnapshot().state.phase).toBe('reconnecting');
    peer.options.onConnection('connected');
    expect(w.a.controller.getSnapshot().state.phase).toBe('active');
  });

  it('clears the quality and relay reading while reconnecting and reads them again once connected', async () => {
    const w = await world();
    await connectCall(w);
    const peer = w.a.peers[0]!;
    peer.options.onConnection('connected');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(w.a.controller.getSnapshot().quality).toBe(3);

    peer.options.onConnection('interrupted');
    expect(w.a.controller.getSnapshot()).toMatchObject({ quality: null, relayed: null });
    await vi.advanceTimersByTimeAsync(4_000);
    expect(w.a.controller.getSnapshot().quality).toBeNull();

    peer.options.onConnection('connected');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(w.a.controller.getSnapshot().quality).toBe(3);
  });

  it('handles control messages for mute, camera and hangup', async () => {
    const w = await world();
    await connectCall(w);
    const peer = w.a.peers[0]!;
    peer.options.onConnection('connected');

    peer.options.onControl({ t: 'mute', on: true });
    peer.options.onControl({ t: 'camera', on: true });
    expect(w.a.controller.getSnapshot()).toMatchObject({ remoteMuted: true, remoteCameraOn: true });

    peer.options.onControl({ t: 'hangup' });
    expect(w.a.controller.getSnapshot().state).toMatchObject({ phase: 'ended', reason: 'completed' });
    expect(peer.closed).toBe(true);
  });

  it('hangs up over the control channel and the socket, closing everything', async () => {
    const w = await world();
    await connectCall(w);
    w.a.peers[0]!.options.onConnection('connected');

    w.a.controller.hangup();
    await settle();

    expect(w.a.peers[0]!.controls).toContainEqual({ t: 'hangup' });
    expect(w.a.socket.sent('call:hangup')).toHaveLength(1);
    expect(w.a.controller.getSnapshot().state.phase).toBe('ended');
    expect(w.b.controller.getSnapshot().state.phase).toBe('ended');
    expect(w.a.peers[0]!.closed).toBe(true);
    expect(w.b.peers[0]!.closed).toBe(true);
    expect(w.a.stopped).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(w.a.controller.getSnapshot().state.phase).toBe('idle');
  });

  it('sends a heartbeat every 10 seconds while a call is live and stops after it ends', async () => {
    const w = await world();
    w.a.socket.connected = true;
    await connectCall(w);

    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 2);
    expect(w.a.socket.sent('call:heartbeat').length).toBeGreaterThanOrEqual(2);

    w.a.controller.hangup();
    const count = w.a.socket.sent('call:heartbeat').length;
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 3);
    expect(w.a.socket.sent('call:heartbeat')).toHaveLength(count);
  });

  it('ends the call at once when a signaling message cannot be sealed', async () => {
    const w = await world();
    await connectCall(w);

    w.a.peers[0]!.options.sendSignal('offer', { description: { type: 'offer', sdp: 'a'.repeat(20000) } });
    await settle();

    expect(w.a.controller.getSnapshot().state).toMatchObject({ phase: 'ended', reason: 'failed', detail: 'signal-failed' });
  });

  it('toggles mute on the peer session', async () => {
    const w = await world();
    await connectCall(w);

    w.a.controller.toggleMute();

    expect(w.a.peers[0]!.muted).toBe(true);
    expect(w.a.controller.getSnapshot().muted).toBe(true);
  });

  it('fails the call and warns when the peer session reports a fingerprint mismatch', async () => {
    const w = await world();
    await connectCall(w);

    w.a.peers[0]!.options.onFatal('fingerprint-mismatch');

    expect(w.a.controller.getSnapshot().state).toMatchObject({ phase: 'ended', reason: 'failed', detail: 'fingerprint-mismatch' });
    expect(w.a.socket.sent('call:hangup')).toHaveLength(1);
  });

  it('falls back to STUN only when the server gives no ice servers', async () => {
    const w = await world();
    void w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind: 'voice' });
    await settle();
    const originalEmit = w.b.socket.onEmit;
    w.b.socket.onEmit = (event, payload) => {
      if (event === 'call:ice-servers') {
        return;
      }
      originalEmit?.(event, payload);
    };
    void w.b.controller.accept();
    await settle();
    await vi.advanceTimersByTimeAsync(8_000);
    await settle();

    expect(w.b.peers[0]?.options.iceServers).toEqual([FALLBACK_STUN]);
  });
});

describe('incoming call gates', () => {
  async function incomingEnvelope(w: World) {
    void w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind: 'voice' });
    await settle();
    return w.a.socket.sent('call:start')[0]!;
  }

  it('drops an invite whose caller key is not the pinned one, silently', async () => {
    const stranger = await makeParty('alice');
    const w = await world({ bobResolve: () => Promise.resolve({ peer: stranger.pinned }) });

    await incomingEnvelope(w);

    expect(w.b.controller.getSnapshot().state.phase).toBe('idle');
    expect(w.b.rings).toEqual([]);
    expect(w.b.socket.emitted.filter((entry) => entry.event !== 'call:sync')).toHaveLength(0);
  });

  it('drops an invite when there is no local private room with exactly the caller and the signed room id', async () => {
    const resolve = vi.fn(() => Promise.resolve({ error: 'unverifiable' } as const));
    const w = await world({ bob: { isPrivateRoomWith: () => false }, bobResolve: resolve });

    await incomingEnvelope(w);

    expect(w.b.controller.getSnapshot().state.phase).toBe('idle');
    expect(resolve).not.toHaveBeenCalled();
  }, 15000);

  it('waits briefly for the room of a first-contact call to reach the local list before deciding', async () => {
    let known = false;
    const w = await world({ bob: { isPrivateRoomWith: () => known } });
    setTimeout(() => {
      known = true;
    }, 250);

    await incomingEnvelope(w);

    await vi.waitFor(() => expect(w.b.controller.getSnapshot().state.phase).toBe('incoming-ringing'), { timeout: 5000 });
  }, 15000);

  it('drops an invite when the caller key changed', async () => {
    const w = await world({ bobResolve: () => Promise.resolve({ error: 'key-changed' }) });

    await incomingEnvelope(w);

    expect(w.b.controller.getSnapshot().state.phase).toBe('idle');
  });

  it('drops an invite claiming another room or caller', async () => {
    const w = await world();
    const start = await incomingEnvelope(w);
    const bobCallId = 'x'.repeat(22);

    w.b.socket.receive('call:incoming', { ...start, kind: 'voice', roomId: 'room-2', callerId: 'alice', ringExpiresAt: 1, callId: bobCallId });
    w.b.socket.receive('call:incoming', { ...start, kind: 'voice', roomId: 'room-1', callerId: 'mallory', ringExpiresAt: 1 });
    await settle();

    expect(w.b.controller.getSnapshot().state.callId).toBe(start.callId);
  });

  it('does not ring twice for the same call id and ignores a second call while busy', async () => {
    const w = await world();
    const start = await incomingEnvelope(w);
    const incoming = { callId: start.callId, roomId: 'room-1', kind: 'voice', callerId: 'alice', envelope: start.envelope, ringExpiresAt: 1 };

    w.b.socket.receive('call:incoming', incoming);
    await settle();

    expect(w.b.rings.filter((entry) => entry === 'incoming')).toHaveLength(1);
  });

  it('declines for all devices and ends on both sides', async () => {
    const w = await world();
    await incomingEnvelope(w);

    w.b.controller.decline();
    await settle();

    expect(w.b.socket.sent('call:decline')).toHaveLength(1);
    expect(w.a.controller.getSnapshot().state).toMatchObject({ phase: 'ended', reason: 'declined' });
    expect(w.b.peers).toHaveLength(0);
  });

  it('silences only this device', async () => {
    const w = await world();
    await incomingEnvelope(w);

    w.b.controller.silence();

    expect(w.b.socket.sent('call:silence')).toHaveLength(1);
    expect(w.b.controller.getSnapshot().state.phase).toBe('incoming-ringing');
    expect(w.b.rings.at(-1)).toBe('stop');
  });

  it('closes the ringing UI when answered elsewhere', async () => {
    const w = await world();
    const start = await incomingEnvelope(w);

    w.b.socket.receive('call:answered-elsewhere', { callId: start.callId });

    expect(w.b.controller.getSnapshot().state).toMatchObject({ phase: 'ended', reason: 'answered-elsewhere' });
  });
});

describe('server events', () => {
  it('fails an outgoing call with busy when the server answers call.peerBusy', async () => {
    const w = await world();
    w.a.socket.onEmit = (event) => {
      if (event === 'call:start') {
        w.a.socket.receive('error', { message: 'x', code: 'call.peerBusy', event: 'call:start' });
      }
    };

    await w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind: 'voice' });
    await settle();

    expect(w.a.controller.getSnapshot().state).toMatchObject({ phase: 'ended', reason: 'busy' });
    expect(w.a.controller.getSnapshot().notice).toBeNull();
  });

  it('keeps connecting with the fallback stun server when the server says relay is unavailable', async () => {
    const w = await world();
    w.b.socket.onEmit = () => undefined;
    const original = w.a.socket.onEmit;
    w.a.socket.onEmit = (event, payload) => {
      if (event === 'call:ice-servers') {
        w.a.socket.receive('error', { message: 'x', code: 'call.relayUnavailable', event: 'call:ice-servers' });
        return;
      }
      original?.(event, payload);
    };
    void w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind: 'voice' });
    await settle();
    const callId = w.a.socket.sent('call:start')[0]!.callId;
    const bobEnvelope = w.b.controller.getSnapshot().state.callId;
    expect(bobEnvelope).toBe(callId);
    void w.b.controller.accept();
    await settle();
    w.a.socket.receive('call:accepted', { callId, envelope: w.b.socket.sent('call:accept')[0]!.envelope, deviceId: 'd' });
    await settle();

    expect(w.a.controller.getSnapshot().state.phase).not.toBe('ended');
    expect(w.a.controller.getSnapshot().notice).toBeNull();
    expect(w.a.peers).toHaveLength(1);
    expect(w.a.peers[0]!.options.iceServers).toEqual([FALLBACK_STUN]);
  });

  it('ends a live call locally when the server reports no active call after reconnecting', async () => {
    const w = await world();
    await connectCall(w);
    w.a.peers[0]!.options.onConnection('connected');

    w.a.socket.receive('call:state', null);

    expect(w.a.controller.getSnapshot().state).toMatchObject({ phase: 'ended', reason: 'connection-lost' });
  });

  it('never restarts a healthy connection when the server confirms the same call after a socket reconnect', async () => {
    const w = await world();
    await connectCall(w);
    const callId = w.a.controller.getSnapshot().state.callId;

    w.a.socket.receive('call:state', { callId, state: 'active', roomId: 'room-1', kind: 'voice', peerId: 'bob', role: 'caller' });
    await settle();

    expect(w.a.peers[0]!.restarts).toBe(0);
    expect(w.a.peers[0]!.recoveries).toEqual(['resync']);
  });

  it('counts restarts and their reasons and only allows probing back to direct on a good stable call', async () => {
    const w = await world();
    await connectCall(w);
    const peer = w.a.peers[0]!;
    peer.options.onConnection('connected');
    expect(peer.options.canProbeDirect()).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(w.a.controller.getSnapshot().quality).toBe(3);
    expect(peer.options.canProbeDirect()).toBe(true);

    peer.options.onRestart('disconnected', false);
    peer.options.onRestart('retry', true);
    expect(w.a.controller.getSnapshot()).toMatchObject({ restartCount: 2, lastRestartReason: 'retry' });

    w.a.controller.hangup();
    await settle();
    w.a.controller.dismissEnded();
    expect(w.a.controller.getSnapshot()).toMatchObject({ restartCount: 0, lastRestartReason: null });
  });

  it('asks the peer to recover when the browser comes back online', async () => {
    const online: Array<() => void> = [];
    vi.stubGlobal('window', { addEventListener: (type: string, listener: () => void) => type === 'online' && online.push(listener), removeEventListener: () => undefined });
    try {
      const w = await world();
      await connectCall(w);
      online.forEach((listener) => listener());
      expect(w.a.peers[0]!.recoveries).toEqual(['online']);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('never hangs up a live call held by another device and shows a passive state instead', async () => {
    const w = await world();
    w.a.socket.receive('call:state', { callId: 'elsewhere', state: 'active', roomId: 'room-1', kind: 'voice', peerId: 'bob', role: 'caller' });
    await settle();
    expect(w.a.socket.sent('call:hangup')).toEqual([]);
    expect(w.a.controller.getSnapshot().otherDevice).toEqual({ callId: 'elsewhere', peerId: 'bob', kind: 'voice', roomId: 'room-1', role: 'caller', answeredAt: null, media: null });
    expect(w.a.controller.getSnapshot().notice).toBeNull();

    w.a.socket.receive('call:ended', { callId: 'elsewhere', reason: 'completed', endedAt: 1 });
    expect(w.a.controller.getSnapshot().otherDevice).toBeNull();
  });

  it('hides the other device offer when the server says the call can no longer be taken over', async () => {
    const w = await world();
    w.a.socket.receive('call:state', { callId: 'elsewhere', state: 'active', roomId: 'room-1', kind: 'voice', peerId: 'bob', role: 'caller', transferable: true });
    await settle();
    expect(w.a.controller.getSnapshot().otherDevice).toMatchObject({ callId: 'elsewhere' });

    w.a.socket.receive('call:state', { callId: 'elsewhere', state: 'active', roomId: 'room-1', kind: 'voice', peerId: 'bob', role: 'caller', transferable: false });
    await settle();
    expect(w.a.controller.getSnapshot().otherDevice).toBeNull();
    expect(w.a.socket.sent('call:hangup')).toEqual([]);
  });

  it('tells the server which call this device is in when it syncs', async () => {
    const w = await world();
    const before = w.a.socket.sent('call:sync').length;
    w.a.socket.receive('connect', undefined);
    await settle();
    const idle = w.a.socket.sent('call:sync').slice(before);
    expect(idle.every((payload) => payload.callId === null)).toBe(true);

    await connectCall(w);
    const callId = w.a.controller.getSnapshot().state.callId;
    const mark = w.a.socket.sent('call:sync').length;
    w.a.socket.receive('connect', undefined);
    await settle();
    expect(w.a.socket.sent('call:sync').slice(mark)).toContainEqual({ callId });
  });

  it('rechecks the other device offer while it is shown', async () => {
    vi.useFakeTimers();
    try {
      const w = await world();
      w.a.socket.receive('call:state', { callId: 'elsewhere', state: 'active', roomId: 'room-1', kind: 'voice', peerId: 'bob', role: 'caller', transferable: true });
      await vi.advanceTimersByTimeAsync(10);
      const before = w.a.socket.sent('call:sync').length;
      await vi.advanceTimersByTimeAsync(OTHER_DEVICE_RECHECK_MS);
      expect(w.a.socket.sent('call:sync').length).toBe(before + 1);
      await vi.advanceTimersByTimeAsync(OTHER_DEVICE_RECHECK_MS);
      expect(w.a.socket.sent('call:sync').length).toBe(before + 2);

      w.a.socket.receive('call:state', null);
      await vi.advanceTimersByTimeAsync(OTHER_DEVICE_RECHECK_MS * 2);
      expect(w.a.socket.sent('call:sync').length).toBe(before + 2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries a refused hangup once after the old socket had time to go quiet', async () => {
    vi.useFakeTimers();
    try {
      const w = await world();
      await connectCall(w);
      const callId = w.a.controller.getSnapshot().state.callId;
      w.a.controller.hangup();
      await vi.advanceTimersByTimeAsync(10);
      expect(w.a.socket.sent('call:hangup')).toEqual([{ callId }]);

      w.a.socket.receive('error', { message: 'x', code: 'call.notAllowed', event: 'call:hangup' });
      await vi.advanceTimersByTimeAsync(HANGUP_RETRY_MS - 100);
      expect(w.a.socket.sent('call:hangup')).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(200);
      expect(w.a.socket.sent('call:hangup')).toEqual([{ callId }, { callId }]);

      w.a.socket.receive('error', { message: 'x', code: 'call.notAllowed', event: 'call:hangup' });
      await vi.advanceTimersByTimeAsync(HANGUP_RETRY_MS * 2);
      expect(w.a.socket.sent('call:hangup')).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ends a call on another device only when the user asks, with an explicit force flag', async () => {
    const w = await world();
    w.a.socket.receive('call:state', { callId: 'elsewhere', state: 'accepted', roomId: 'room-1', kind: 'video', peerId: 'bob', role: 'callee' });
    await settle();
    w.a.controller.endOtherDeviceCall();
    expect(w.a.socket.sent('call:hangup')).toEqual([{ callId: 'elsewhere', force: true }]);
    expect(w.a.controller.getSnapshot().otherDevice).toBeNull();

    w.a.socket.receive('call:state', { callId: 'second', state: 'active', roomId: 'room-1', kind: 'voice', peerId: 'bob', role: 'caller' });
    await settle();
    w.a.socket.receive('call:state', null);
    expect(w.a.controller.getSnapshot().otherDevice).toBeNull();
  });

  it('leaves a ringing call placed from another device alone', async () => {
    const w = await world();
    w.a.socket.receive('call:state', { callId: 'outgoing', state: 'ringing', roomId: 'room-1', kind: 'voice', peerId: 'bob', role: 'caller' });
    await settle();
    expect(w.a.socket.sent('call:hangup')).toEqual([]);
    expect(w.a.controller.getSnapshot().otherDevice).toBeNull();
  });

  it('does not show the other device state when another tab of this browser owns the call', async () => {

    const tabs = createTabOwnership({ locks: null, createChannel: () => null, tabId: 'y' });
    const busy = await world({ alice: { tabs: { ...tabs, isCallHeldByOtherTab: () => Promise.resolve(true) } } });
    busy.a.socket.receive('call:state', { callId: 'orphan', state: 'active', roomId: 'room-1', kind: 'voice', peerId: 'bob', role: 'caller' });
    await settle();
    expect(busy.a.socket.sent('call:hangup')).toHaveLength(0);
    expect(busy.a.controller.getSnapshot().otherDevice).toBeNull();
  });

  it('keeps a server call that is still ringing for this user so opening the app from a push does not decline it', async () => {
    const w = await world();
    w.a.socket.receive('call:state', { callId: 'ringing', state: 'ringing', roomId: 'room-1', kind: 'voice', peerId: 'bob', role: 'callee' });
    await settle();
    expect(w.a.socket.sent('call:hangup')).toHaveLength(0);

    w.a.socket.receive('call:state', { callId: 'outgoing', state: 'ringing', roomId: 'room-1', kind: 'voice', peerId: 'bob', role: 'caller' });
    await settle();
    expect(w.a.socket.sent('call:hangup')).toHaveLength(0);
  });

  it('ignores an accepted event with a forged or foreign envelope by ending the call', async () => {
    const w = await world();
    void w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind: 'voice' });
    await settle();
    const callId = w.a.socket.sent('call:start')[0]!.callId;

    w.a.socket.receive('call:accepted', { callId, envelope: '{"v":1}', deviceId: 'd' });
    await settle();

    expect(w.a.controller.getSnapshot().state).toMatchObject({ phase: 'ended', reason: 'failed', detail: 'invalid-accept' });
    expect(w.a.peers).toHaveLength(0);
  });

  it('ends the losing callee locally without hanging up when call:accept is rejected', async () => {
    const w = await world();
    w.b.socket.onEmit = (event) => {
      if (event === 'call:accept') {
        w.b.socket.receive('error', { message: 'x', code: 'call.invalidState', event: 'call:accept' });
      }
    };
    void w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind: 'voice' });
    await settle();

    void w.b.controller.accept();
    await settle();

    expect(w.b.controller.getSnapshot().state).toMatchObject({ phase: 'ended', reason: 'answered-elsewhere' });
    expect(w.b.socket.sent('call:hangup')).toHaveLength(0);
    expect(w.b.peers.every((peer) => peer.closed)).toBe(true);
    expect(w.b.stopped).toBeGreaterThan(0);
  });

  it('shows the normal error and fails the call for accept errors that are not about the call being taken', async () => {
    const w = await world();
    w.b.socket.onEmit = (event) => {
      if (event === 'call:accept') {
        w.b.socket.receive('error', { message: 'x', code: 'call.rateLimited', event: 'call:accept' });
      }
    };
    void w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind: 'voice' });
    await settle();

    void w.b.controller.accept();
    await settle();

    expect(w.b.controller.getSnapshot().state).toMatchObject({ phase: 'ended', reason: 'failed', detail: 'call.rateLimited' });
    expect(w.b.controller.getSnapshot().notice).toEqual({ kind: 'server-error', code: 'call.rateLimited' });
  });

  it('ends the losing callee locally when answered elsewhere while connecting', async () => {
    const w = await world();
    await connectCall(w);

    w.b.socket.receive('call:answered-elsewhere', { callId: w.b.controller.getSnapshot().state.callId });

    expect(w.b.controller.getSnapshot().state.phase).toBe('ended');
    expect(w.b.socket.sent('call:hangup')).toHaveLength(0);
    expect(w.b.peers[0]!.closed).toBe(true);
  });

  it('ignores errors that belong to another call or arrive with no call', async () => {
    const w = await world();
    void w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind: 'voice' });
    await settle();

    w.a.socket.receive('error', { message: 'x', code: 'call.notAllowed', event: 'call:start', params: { callId: 'someone-else' } });
    expect(w.a.controller.getSnapshot().state.phase).toBe('outgoing-ringing');

    w.a.controller.hangup();
    await settle();
    w.a.socket.receive('error', { message: 'x', code: 'call.notAllowed', event: 'call:start' });
    w.a.socket.receive('error', { message: 'x', code: 'call.relayUnavailable', event: 'call:ice-servers' });
    expect(w.a.controller.getSnapshot().notice).toBeNull();
  });

  it('lets a renewed ice request outlive the timer of the request it replaced', async () => {
    const w = await world();
    await connectCall(w);
    const callId = w.a.controller.getSnapshot().state.callId;
    const originalEmit = w.a.socket.onEmit;
    w.a.socket.onEmit = (event, payload) => {
      if (event !== 'call:ice-servers') {
        originalEmit?.(event, payload);
      }
    };
    const refresh = w.a.peers[0]!.options.refreshIceServers;

    void refresh();
    await vi.advanceTimersByTimeAsync(5_000);
    const second = refresh();
    await vi.advanceTimersByTimeAsync(4_000);
    w.a.socket.receive('call:ice-servers-result', { callId, ...SERVER_ICE });

    expect(await second).not.toBeNull();
  });

  it('wipes the ephemeral key when disposed mid-ring', async () => {
    const w = await world();
    void w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind: 'voice' });
    await settle();
    const ek = (w.a.controller as unknown as { session: { ownEk: { privateKey: Uint8Array } } }).session.ownEk;
    expect(ek.privateKey.some((byte) => byte !== 0)).toBe(true);

    w.a.controller.dispose();

    expect(ek.privateKey.every((byte) => byte === 0)).toBe(true);
  });

  it('wipes the derived session keys when the callee is overtaken while answering', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const w = await world({
      bob: {
        acquireMedia: async () => {
          await gate;
          return { stream: { getTracks: () => [], getAudioTracks: () => [], getVideoTracks: () => [] } as unknown as MediaStream, cameraFailed: false };
        },
      },
    });
    void w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind: 'voice' });
    await settle();
    derivedKeys.length = 0;

    void w.b.controller.accept();
    await settle();
    w.b.socket.receive('call:answered-elsewhere', { callId: w.b.controller.getSnapshot().state.callId });
    release();
    await settle();

    expect(derivedKeys).toHaveLength(1);
    expect(derivedKeys[0]!.send.every((byte) => byte === 0)).toBe(true);
    expect(derivedKeys[0]!.receive.every((byte) => byte === 0)).toBe(true);
  });

  it('maps an unknown server end reason to failed so it cannot pick an arbitrary translation key', async () => {
    const w = await world();
    await connectCall(w);

    w.a.socket.receive('call:ended', { callId: w.a.controller.getSnapshot().state.callId, reason: '../../x', endedAt: '' });

    expect(w.a.controller.getSnapshot().state).toMatchObject({ phase: 'ended', reason: 'failed' });
    expect(sanitizeEndReason('declined')).toBe('declined');
  });

  it('makes the callee wait for the accepted event before asking for ice servers', async () => {
    const w = await world();
    const held: Array<() => void> = [];
    const route = w.b.socket.onEmit!;
    w.b.socket.onEmit = (event, payload) => {
      if (event === 'call:accept') {
        held.push(() => route(event, payload));
        return;
      }
      route(event, payload);
    };
    void w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind: 'voice' });
    await settle();

    void w.b.controller.accept();
    await settle();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(w.b.socket.sent('call:accept')).toHaveLength(1);
    expect(w.b.socket.sent('call:ice-servers')).toHaveLength(0);
    expect(w.b.peers).toHaveLength(0);

    held.forEach((release) => release());
    await settle();

    expect(w.b.socket.sent('call:ice-servers')).toHaveLength(1);
    expect(w.b.peers).toHaveLength(1);
  });

  it('retries ice servers with backoff on call.invalidState before giving up', async () => {
    const w = await world();
    const route = w.b.socket.onEmit!;
    let rejections = 2;
    w.b.socket.onEmit = (event, payload) => {
      if (event === 'call:ice-servers' && rejections > 0) {
        rejections -= 1;
        w.b.socket.receive('error', { message: 'x', code: 'call.invalidState', event: 'call:ice-servers' });
        return;
      }
      route(event, payload);
    };
    await connectCall(w);
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    await vi.advanceTimersByTimeAsync(600);
    await settle();

    expect(w.b.socket.sent('call:ice-servers')).toHaveLength(3);
    expect(w.b.peers).toHaveLength(1);
    expect(w.b.controller.getSnapshot().state.phase).toBe('connecting');
  });

  it('keeps the call with fallback servers when the server is slow to confirm the accept', async () => {
    const w = await world();
    const route = w.b.socket.onEmit!;
    w.b.socket.onEmit = (event, payload) => {
      if (event === 'call:ice-servers') {
        w.b.socket.receive('error', { message: 'x', code: 'call.invalidState', event: 'call:ice-servers' });
        return;
      }
      route(event, payload);
    };
    await connectCall(w);
    for (const delay of [300, 600, 1200, 2400, 4800]) {
      await vi.advanceTimersByTimeAsync(delay);
      await settle();
    }

    expect(w.b.socket.sent('call:ice-servers')).toHaveLength(6);
    expect(w.b.controller.getSnapshot().state.phase).toBe('connecting');
    expect(w.b.peers.at(-1)?.options.iceServers).toEqual([FALLBACK_STUN]);
  });

  it('removes its socket listeners when disposed', async () => {
    const w = await world();
    const before = Array.from(w.a.socket.handlers.values()).reduce((sum, set) => sum + set.size, 0);
    expect(before).toBeGreaterThan(0);

    w.a.controller.dispose();

    expect(Array.from(w.a.socket.handlers.values()).reduce((sum, set) => sum + set.size, 0)).toBe(0);
  });
});

function screenStream(withAudio = true) {
  const listeners: Array<[string, () => void]> = [];
  const video = {
    kind: 'video',
    stopped: false,
    stop() {
      this.stopped = true;
    },
    addEventListener: (event: string, listener: () => void) => listeners.push([event, listener]),
    removeEventListener: (event: string, listener: () => void) => {
      const index = listeners.findIndex(([type, handler]) => type === event && handler === listener);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
    },
  };
  const fire = (type: string) => listeners.filter(([event]) => event === type).forEach(([, listener]) => listener());
  const audio = { kind: 'audio', stopped: false, stop() { this.stopped = true; } };
  const tracks = withAudio ? [video, audio] : [video];
  const stream = {
    getTracks: () => tracks,
    getVideoTracks: () => [video],
    getAudioTracks: () => (withAudio ? [audio] : []),
  } as unknown as MediaStream;
  return { stream, video, audio, end: () => fire('ended'), mute: () => fire('mute'), unmute: () => fire('unmute') };
}

describe('low severity call fixes', () => {
  it('tells apart a busy, a missing and a denied microphone', async () => {
    const cases: Array<[string, string]> = [
      ['NotReadableError', 'media-busy'],
      ['AbortError', 'media-busy'],
      ['NotFoundError', 'no-microphone'],
      ['NotAllowedError', 'media-denied'],
    ];
    for (const [name, kind] of cases) {
      const w = await world({ alice: { acquireMedia: () => Promise.reject(new DOMException('x', name)) } });
      await w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind: 'voice' });
      expect(w.a.controller.getSnapshot().notice).toEqual({ kind });
    }
  });

  it('stops the screen share when the browser ends it while the share is still being set up', async () => {
    const screen = screenStream();
    const w = await world({ alice: { acquireScreen: () => Promise.resolve(screen.stream), stopMedia: (stream) => { for (const track of stream?.getTracks() ?? []) { track.stop(); } } } });
    await connectCall(w);
    const peer = w.a.peers[0]!;
    peer.options.onConnection('connected');
    const original = peer.setMovieMode.bind(peer);
    peer.setMovieMode = (movie) => {
      screen.end();
      return original(movie);
    };

    await w.a.controller.toggleScreenShare();

    expect(w.a.controller.getSnapshot().screenSharing).toBe(false);
    expect(screen.video.stopped).toBe(true);
    expect(peer.screenTracks.at(-1)).toEqual({ video: null, audio: null });
  });

  it('releases the screen stream when applying the share constraints fails', async () => {
    const screen = screenStream();
    const w = await world({
      alice: {
        acquireScreen: () => Promise.resolve(screen.stream),
        applyShareConstraints: () => Promise.reject(new Error('constraints')),
        stopMedia: (stream) => { for (const track of stream?.getTracks() ?? []) { track.stop(); } },
      },
    });
    await connectCall(w);
    w.a.peers[0]!.options.onConnection('connected');

    await expect(w.a.controller.toggleScreenShare()).resolves.toBeUndefined();

    expect(screen.video.stopped).toBe(true);
    expect(w.a.controller.getSnapshot().screenSharing).toBe(false);
  });

  it('gives the ringtone back when the outgoing ring ended before the claim was granted', async () => {
    const w = await world();
    let grant: (claimed: boolean) => void = () => undefined;
    const release = vi.fn();
    w.a.deps.tabs.claimRingtone = () => new Promise<boolean>((resolve) => (grant = resolve));
    w.a.deps.tabs.releaseRingtone = release;
    w.a.socket.onEmit = (event, payload) => {
      if (event === 'call:start') {
        w.a.socket.receive('call:ended', { callId: payload.callId, reason: 'busy', endedAt: 1 });
      }
    };

    await w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind: 'voice' });
    const before = release.mock.calls.length;
    grant(true);
    await settle();

    expect(release.mock.calls.length).toBe(before + 1);
    expect(w.a.rings).not.toContain('outgoing');
  });

  it('turns the camera off and stops it when audio-only-relay keeps video from being sent', async () => {
    const stopped: string[] = [];
    const camera = { kind: 'video', readyState: 'live', stop: () => stopped.push('cam') };
    const tracks: unknown[] = [];
    const stream = {
      getTracks: () => [...tracks],
      getAudioTracks: () => [],
      getVideoTracks: () => tracks.filter((track) => (track as { kind: string }).kind === 'video'),
      addTrack: (track: unknown) => void tracks.push(track),
      removeTrack: (track: unknown) => void tracks.splice(tracks.indexOf(track), 1),
    } as unknown as MediaStream;
    const w = await world({ alice: { acquireMedia: () => Promise.resolve({ stream, cameraFailed: false }), acquireCamera: () => Promise.resolve(camera as unknown as MediaStreamTrack) } });
    await connectCall(w);
    const peer = w.a.peers[0]!;
    peer.options.onConnection('connected');
    peer.setVideoTrack = () => Promise.resolve(false as unknown as void);

    await w.a.controller.toggleCamera();

    expect(stopped).toEqual(['cam']);
    expect(w.a.controller.getSnapshot()).toMatchObject({ cameraOn: false, notice: { kind: 'camera-degraded' } });
  });
});

describe('screen share', () => {
  async function activeCall(acquireScreen: () => Promise<MediaStream | null>) {
    const w = await world({ alice: { acquireScreen, stopMedia: (stream) => { for (const track of stream?.getTracks() ?? []) { track.stop(); } } } });
    await connectCall(w);
    const peer = w.a.peers[0]!;
    peer.options.onConnection('connected');
    return { w, peer };
  }

  it('exposes whether sharing is possible once media is verified and connected', async () => {
    const { w } = await activeCall(() => Promise.resolve(null));
    expect(w.a.controller.getSnapshot().canShareScreen).toBe(true);

    const other = await world();
    await connectCall(other);
    other.a.peers[0]!.shareable = false;
    other.a.peers[0]!.options.onConnection('connected');
    expect(other.a.controller.getSnapshot().canShareScreen).toBe(false);
  });

  it('tells the viewer and the sharer when the browser stops providing frames and clears it on unmute', async () => {
    const share = screenStream();
    const { w, peer } = await activeCall(() => Promise.resolve(share.stream));
    await w.a.controller.toggleScreenShare();
    const sent = peer.screenInfos.length;

    share.mute();
    expect(w.a.controller.getSnapshot().screenPaused).toBe(true);
    expect(peer.screenInfos).toHaveLength(sent + 1);
    expect(peer.screenInfos.at(-1)).toMatchObject({ paused: true });

    share.mute();
    expect(peer.screenInfos).toHaveLength(sent + 1);

    share.unmute();
    expect(w.a.controller.getSnapshot().screenPaused).toBe(false);
    expect(peer.screenInfos.at(-1)).toMatchObject({ paused: false });
    expect(w.a.controller.getSnapshot().screenSharing).toBe(true);
    expect(share.video.stopped).toBe(false);
  });

  it('keeps the paused flag across surface and movie updates and drops it when the share stops', async () => {
    const share = screenStream();
    const { w, peer } = await activeCall(() => Promise.resolve(share.stream));
    await w.a.controller.toggleScreenShare();
    share.mute();

    await w.a.controller.setMovieMode(true);
    expect(peer.screenInfos.at(-1)).toMatchObject({ movie: true, paused: true });

    await w.a.controller.toggleScreenShare();
    expect(w.a.controller.getSnapshot().screenPaused).toBe(false);
    share.mute();
    expect(w.a.controller.getSnapshot().screenPaused).toBe(false);
  });

  it('shows the viewer the paused state announced by the sharer and clears it', async () => {
    const w = await world();
    await connectCall(w);
    const peer = w.b.peers[0]!;
    peer.options.onConnection('connected');

    peer.options.onControl({ t: 'screen', on: true, surface: 'window', paused: true });
    expect(w.b.controller.getSnapshot()).toMatchObject({ remoteScreenOn: true, remoteScreenPaused: true });

    peer.options.onControl({ t: 'screen', on: true, surface: 'window', paused: false });
    expect(w.b.controller.getSnapshot().remoteScreenPaused).toBe(false);

    peer.options.onControl({ t: 'screen', on: true, paused: true });
    peer.options.onControl({ t: 'screen', on: false });
    expect(w.b.controller.getSnapshot()).toMatchObject({ remoteScreenOn: false, remoteScreenPaused: false });
  });

  it('shares the screen video and audio, then stops and releases the capture', async () => {
    const share = screenStream();
    const { w, peer } = await activeCall(() => Promise.resolve(share.stream));

    await w.a.controller.toggleScreenShare();
    expect(peer.screenTracks).toEqual([{ video: share.video, audio: share.audio }]);
    expect(w.a.controller.getSnapshot()).toMatchObject({ screenSharing: true, localScreenStream: share.stream });

    await w.a.controller.toggleScreenShare();
    expect(peer.screenTracks.at(-1)).toEqual({ video: null, audio: null });
    expect(share.video.stopped).toBe(true);
    expect(share.audio.stopped).toBe(true);
    expect(w.a.controller.getSnapshot()).toMatchObject({ screenSharing: false, localScreenStream: null });
  });

  it('stops sharing when the browser ends the capture', async () => {
    const share = screenStream(false);
    const { w, peer } = await activeCall(() => Promise.resolve(share.stream));
    await w.a.controller.toggleScreenShare();
    expect(peer.screenTracks[0]).toEqual({ video: share.video, audio: null });

    share.end();
    await settle();

    expect(peer.screenTracks.at(-1)).toEqual({ video: null, audio: null });
    expect(w.a.controller.getSnapshot().screenSharing).toBe(false);
  });

  it('stops sharing on hang up', async () => {
    const share = screenStream();
    const { w } = await activeCall(() => Promise.resolve(share.stream));
    await w.a.controller.toggleScreenShare();

    w.a.controller.hangup();
    await settle();

    expect(share.video.stopped).toBe(true);
    expect(w.a.controller.getSnapshot()).toMatchObject({ screenSharing: false, localScreenStream: null, remoteScreenStream: null });
  });

  it('does nothing when the picker is cancelled and never captures before the call is connected', async () => {
    let asked = 0;
    const w = await world({ alice: { acquireScreen: () => { asked += 1; return Promise.resolve(null); } } });
    await connectCall(w);
    await w.a.controller.toggleScreenShare();
    expect(asked).toBe(0);

    w.a.peers[0]!.options.onConnection('connected');
    await w.a.controller.toggleScreenShare();
    expect(asked).toBe(1);
    expect(w.a.controller.getSnapshot().screenSharing).toBe(false);
    expect(w.a.peers[0]!.screenTracks).toEqual([]);
  });

  it('releases the capture and shows a notice when the peer session refuses it', async () => {
    const share = screenStream();
    const { w, peer } = await activeCall(() => Promise.resolve(share.stream));
    peer.screenResult = false;

    await w.a.controller.toggleScreenShare();

    expect(share.video.stopped).toBe(true);
    expect(w.a.controller.getSnapshot()).toMatchObject({ screenSharing: false, notice: { kind: 'screen-failed' } });
  });

  it('stops an active share with a notice when the server degrades to audio only', async () => {
    const share = screenStream();
    const { w, peer } = await activeCall(() => Promise.resolve(share.stream));
    await w.a.controller.toggleScreenShare();

    peer.options.onDegrade('audio-only-relay');

    expect(share.video.stopped).toBe(true);
    expect(w.a.controller.getSnapshot()).toMatchObject({ screenSharing: false, degrade: 'audio-only-relay', notice: { kind: 'screen-degraded' } });
    await w.a.controller.toggleScreenShare();
    expect(peer.screenTracks).toHaveLength(1);
  });

  it('tracks the remote share state and stream', async () => {
    const { w, peer } = await activeCall(() => Promise.resolve(null));
    const remote = { id: 'screen' } as unknown as MediaStream;

    peer.options.onRemoteScreen(remote);
    peer.options.onControl({ t: 'screen', on: true });
    expect(w.a.controller.getSnapshot()).toMatchObject({ remoteScreenOn: true, remoteScreenStream: remote });

    peer.options.onControl({ t: 'screen', on: false });
    expect(w.a.controller.getSnapshot().remoteScreenOn).toBe(false);
  });
});

describe('unstable connection', () => {
  it('shows the notice and lowers the camera after 4 s above 5% loss, then restores', async () => {
    const w = await world();
    await connectCall(w);
    const peer = w.a.peers[0]!;
    peer.options.onConnection('connected');
    let received = 0;
    let lost = 0;
    const tick = async (loss: number) => {
      received += 90;
      lost += Math.round(loss * 100);
      peer.statsReport = new Map([['in', { type: 'inbound-rtp', kind: 'audio', packetsReceived: received, packetsLost: lost }]]);
      await vi.advanceTimersByTimeAsync(2_000);
    };

    await tick(0);
    await tick(0.1);
    expect(w.a.controller.getSnapshot().unstable).toBe(false);
    await tick(0.1);
    expect(w.a.controller.getSnapshot().unstable).toBe(true);
    expect(peer.unstableCalls).toEqual([true]);

    await tick(0);
    await tick(0);
    expect(w.a.controller.getSnapshot().unstable).toBe(false);
    expect(peer.unstableCalls).toEqual([true, false]);
  });

  it('also reacts to the loss the other side reports for our outgoing media', async () => {
    const w = await world();
    await connectCall(w);
    const peer = w.a.peers[0]!;
    peer.options.onConnection('connected');
    peer.statsReport = new Map([['remote', { type: 'remote-inbound-rtp', kind: 'video', fractionLost: 0.2 }]]);

    await vi.advanceTimersByTimeAsync(4_000);

    expect(w.a.controller.getSnapshot().unstable).toBe(true);
  });
});

describe('screen share review fixes', () => {
  it('enables sharing when the peer announces screen support after connecting', async () => {
    const w = await world();
    await connectCall(w);
    const peer = w.a.peers[0]!;
    peer.shareable = false;
    peer.options.onConnection('connected');
    expect(w.a.controller.getSnapshot().canShareScreen).toBe(false);

    peer.shareable = true;
    peer.options.onControl({ t: 'caps', screen: true });

    expect(w.a.controller.getSnapshot().canShareScreen).toBe(true);
  });

  it('stops the capture when attaching it switches the call to audio only', async () => {
    const share = screenStream();
    const w = await world({ alice: { acquireScreen: () => Promise.resolve(share.stream), stopMedia: (stream) => { for (const track of stream?.getTracks() ?? []) { track.stop(); } } } });
    await connectCall(w);
    const peer = w.a.peers[0]!;
    peer.options.onConnection('connected');
    peer.setScreenTracks = (video, audio = null) => {
      peer.screenTracks.push({ video, audio });
      if (video) {
        peer.options.onDegrade('audio-only-relay');
      }
      return Promise.resolve(true);
    };

    await w.a.controller.toggleScreenShare();

    expect(share.video.stopped).toBe(true);
    expect(peer.screenTracks.at(-1)).toEqual({ video: null, audio: null });
    expect(w.a.controller.getSnapshot()).toMatchObject({ screenSharing: false, localScreenStream: null, notice: { kind: 'screen-degraded' } });
  });
});

describe('screen share info and volume', () => {
  function surfaceStream(surface: string, label: string, withAudio = true) {
    const share = screenStream(withAudio);
    let current = { surface, label };
    Object.defineProperty(share.video, 'getSettings', { value: () => ({ displaySurface: current.surface }) });
    Object.defineProperty(share.video, 'label', { get: () => current.label });
    return { ...share, switchTo: (next: { surface: string; label: string }) => { current = next; } };
  }

  it('sends the surface, routes the share audio through the volume control and re-sends on surface switches', async () => {
    const share = surfaceStream('browser', 'Docs');
    const gains: number[] = [];
    let stopped = 0;
    const mixed = { kind: 'audio' } as unknown as MediaStreamTrack;
    const w = await world({
      alice: {
        acquireScreen: () => Promise.resolve(share.stream),
        getShareVolume: () => 0.5,
        saveShareVolume: (volume) => volume,
        createShareAudio: (_track, volume) => {
          gains.push(volume);
          return { track: mixed, controllable: true, setVolume: (next) => gains.push(next), stop: () => void (stopped += 1) };
        },
      },
    });
    await connectCall(w);
    const peer = w.a.peers[0]!;
    peer.options.onConnection('connected');

    await w.a.controller.toggleScreenShare();
    expect(peer.screenTracks[0]).toEqual({ video: share.video, audio: mixed });
    expect(peer.screenInfos[0]).toEqual({ surface: 'browser', label: 'Docs', audio: true, movie: false });
    expect(w.a.controller.getSnapshot()).toMatchObject({ shareAudio: true, shareVolume: 0.5 });

    w.a.controller.setShareVolume(0.2);
    expect(gains).toEqual([0.5, 0.2]);
    expect(w.a.controller.getSnapshot().shareVolume).toBe(0.2);

    share.switchTo({ surface: 'window', label: 'Editor' });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(peer.screenInfos.at(-1)).toEqual({ surface: 'window', label: 'Editor', audio: true, movie: false });
    const sent = peer.screenInfos.length;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(peer.screenInfos).toHaveLength(sent);

    await w.a.controller.toggleScreenShare();
    expect(stopped).toBe(1);
    expect(w.a.controller.getSnapshot().shareAudio).toBe(false);
  });

  it('hides the volume control when the share has no audio and stops the mixer on hang up', async () => {
    const silent = surfaceStream('monitor', '', false);
    let created = 0;
    const w = await world({ alice: { acquireScreen: () => Promise.resolve(silent.stream), createShareAudio: (track) => { created += 1; return { track, controllable: true, setVolume: () => undefined, stop: () => undefined }; } } });
    await connectCall(w);
    w.a.peers[0]!.options.onConnection('connected');
    await w.a.controller.toggleScreenShare();
    expect(created).toBe(0);
    expect(w.a.controller.getSnapshot().shareAudio).toBe(false);

    const loud = surfaceStream('browser', 'Video');
    let stopped = 0;
    const other = await world({ alice: { acquireScreen: () => Promise.resolve(loud.stream), createShareAudio: (track) => ({ track, controllable: true, setVolume: () => undefined, stop: () => void (stopped += 1) }) } });
    await connectCall(other);
    other.a.peers[0]!.options.onConnection('connected');
    await other.a.controller.toggleScreenShare();
    other.a.controller.hangup();
    await settle();
    expect(stopped).toBe(1);
  });

  it('shows the peer surface and label and clears them when the share stops', async () => {
    const w = await world();
    await connectCall(w);
    const peer = w.a.peers[0]!;
    peer.options.onConnection('connected');

    peer.options.onControl({ t: 'screen', on: true, surface: 'window', label: 'Slides' });
    expect(w.a.controller.getSnapshot()).toMatchObject({ remoteScreenOn: true, remoteScreenSurface: 'window', remoteScreenLabel: 'Slides' });

    peer.options.onControl({ t: 'screen', on: false });
    expect(w.a.controller.getSnapshot()).toMatchObject({ remoteScreenOn: false, remoteScreenSurface: null, remoteScreenLabel: null });
  });
});

describe('relay indicator', () => {
  it('exposes whether the call goes through TURN and resets it when the call ends', async () => {
    const w = await world();
    await connectCall(w);
    const peer = w.a.peers[0]!;
    peer.options.onConnection('connected');
    const relayedStats = new Map<string, Record<string, unknown>>([
      ['t', { type: 'transport', selectedCandidatePairId: 'p' }],
      ['p', { type: 'candidate-pair', localCandidateId: 'l', remoteCandidateId: 'r' }],
      ['l', { type: 'local-candidate', candidateType: 'relay' }],
      ['r', { type: 'remote-candidate', candidateType: 'host' }],
    ]);
    expect(w.a.controller.getSnapshot().relayed).toBeNull();

    peer.statsReport = relayedStats;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(w.a.controller.getSnapshot().relayed).toBe(true);

    relayedStats.set('l', { type: 'local-candidate', candidateType: 'host' });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(w.a.controller.getSnapshot().relayed).toBe(true);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(w.a.controller.getSnapshot().relayed).toBe(false);

    w.a.controller.hangup();
    await settle();
    expect(w.a.controller.getSnapshot().relayed).toBeNull();
  });

  it('reports the media route in the heartbeat and right away when it changes, so the server counts only relayed time', async () => {
    const w = await world();
    w.a.socket.connected = true;
    await connectCall(w);
    const peer = w.a.peers[0]!;
    peer.options.onConnection('connected');
    const callId = w.a.controller.getSnapshot().state.callId;
    const stats = new Map<string, Record<string, unknown>>([
      ['t', { type: 'transport', selectedCandidatePairId: 'p' }],
      ['p', { type: 'candidate-pair', localCandidateId: 'l', remoteCandidateId: 'r' }],
      ['l', { type: 'local-candidate', candidateType: 'host' }],
      ['r', { type: 'remote-candidate', candidateType: 'srflx' }],
    ]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(w.a.socket.sent('call:heartbeat').at(-1)).not.toHaveProperty('relayed');

    peer.statsReport = stats;
    const before = w.a.socket.sent('call:heartbeat').length;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(w.a.socket.sent('call:heartbeat')).toHaveLength(before + 1);
    expect(w.a.socket.sent('call:heartbeat').at(-1)).toMatchObject({ callId, relayed: false });

    await vi.advanceTimersByTimeAsync(10_000);
    expect(w.a.socket.sent('call:heartbeat').at(-1)).toMatchObject({ callId, relayed: false });

    stats.set('l', { type: 'local-candidate', candidateType: 'relay' });
    await vi.advanceTimersByTimeAsync(4_000);
    expect(w.a.socket.sent('call:heartbeat').at(-1)).toMatchObject({ callId, relayed: true });
  });

  it('lets the peer drop its relay credentials only after a stable direct reading on a healthy connection', async () => {
    const w = await world();
    w.a.socket.connected = true;
    await connectCall(w);
    const peer = w.a.peers[0]!;
    peer.options.onConnection('connected');
    const callId = w.a.controller.getSnapshot().state.callId;
    const stats = new Map<string, Record<string, unknown>>([
      ['t', { type: 'transport', selectedCandidatePairId: 'p' }],
      ['p', { type: 'candidate-pair', localCandidateId: 'l', remoteCandidateId: 'r' }],
      ['l', { type: 'local-candidate', candidateType: 'relay' }],
      ['r', { type: 'remote-candidate', candidateType: 'host' }],
    ]);
    peer.statsReport = stats;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(w.a.socket.sent('call:heartbeat').at(-1)).toMatchObject({ callId, relayed: true });
    expect(peer.dropped).toBe(0);

    stats.set('l', { type: 'local-candidate', candidateType: 'host' });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(w.a.socket.sent('call:heartbeat').at(-1)).toMatchObject({ callId, relayed: true });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(w.a.socket.sent('call:heartbeat').at(-1)).toMatchObject({ callId, relayed: false });
    expect(peer.dropped).toBe(1);

    peer.iceHealthy = false;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(w.a.socket.sent('call:heartbeat').at(-1)).not.toHaveProperty('relayed');
    expect(peer.dropped).toBe(1);
  });

  it('forgets the route on every ICE restart so a stale direct reading never drops the credentials a relay fallback needs', async () => {
    const w = await world();
    w.a.socket.connected = true;
    await connectCall(w);
    const peer = w.a.peers[0]!;
    peer.options.onConnection('connected');
    const callId = w.a.controller.getSnapshot().state.callId;
    peer.statsReport = new Map<string, Record<string, unknown>>([
      ['t', { type: 'transport', selectedCandidatePairId: 'p' }],
      ['p', { type: 'candidate-pair', localCandidateId: 'l', remoteCandidateId: 'r' }],
      ['l', { type: 'local-candidate', candidateType: 'host' }],
      ['r', { type: 'remote-candidate', candidateType: 'host' }],
    ]);
    await vi.advanceTimersByTimeAsync(2_000);
    const dropped = peer.dropped;

    peer.options.onRestart('failed', true);
    peer.statsReport = new Map();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(w.a.socket.sent('call:heartbeat').at(-1)).toMatchObject({ callId });
    expect(w.a.socket.sent('call:heartbeat').at(-1)).not.toHaveProperty('relayed');
    expect(peer.dropped).toBe(dropped);
  });
});

describe('screen share review hardening', () => {
  it('releases the capture and the audio mixer when attaching the share throws', async () => {
    const share = screenStream();
    let mixerStopped = 0;
    const w = await world({
      alice: {
        acquireScreen: () => Promise.resolve(share.stream),
        stopMedia: (stream) => { for (const track of stream?.getTracks() ?? []) { track.stop(); } },
        createShareAudio: (track) => ({ track, controllable: true, setVolume: () => undefined, stop: () => void (mixerStopped += 1) }),
      },
    });
    await connectCall(w);
    const peer = w.a.peers[0]!;
    peer.options.onConnection('connected');
    peer.setScreenTracks = () => Promise.reject(new Error('boom'));

    await w.a.controller.toggleScreenShare();

    expect(share.video.stopped).toBe(true);
    expect(mixerStopped).toBe(1);
    expect(w.a.controller.getSnapshot()).toMatchObject({ screenSharing: false, shareAudio: false, notice: { kind: 'screen-failed' } });
  });

  it('tells the peer whether the share carries audio and shows it on the receiver', async () => {
    const share = screenStream();
    const w = await world({ alice: { acquireScreen: () => Promise.resolve(share.stream) } });
    await connectCall(w);
    const peer = w.a.peers[0]!;
    peer.options.onConnection('connected');
    Object.defineProperty(share.video, 'getSettings', { value: () => ({ displaySurface: 'browser' }) });
    Object.defineProperty(share.video, 'label', { value: 'Tab' });
    await w.a.controller.toggleScreenShare();
    expect(peer.screenInfos[0]).toMatchObject({ audio: true });

    peer.options.onControl({ t: 'screen', on: true, audio: false });
    expect(w.a.controller.getSnapshot().remoteScreenAudio).toBe(false);
    peer.options.onControl({ t: 'screen', on: true, audio: true });
    expect(w.a.controller.getSnapshot().remoteScreenAudio).toBe(true);
  });
});

describe('movie mode', () => {
  it('applies the saved mode when sharing starts and toggles it live without a new capture', async () => {
    const share = screenStream();
    const constraints: boolean[] = [];
    const saved: boolean[] = [];
    let stored = true;
    const w = await world({
      alice: {
        acquireScreen: () => Promise.resolve(share.stream),
        getMovieMode: () => stored,
        saveMovieMode: (movie) => {
          stored = movie;
          saved.push(movie);
          return movie;
        },
        applyShareConstraints: (_stream, movie) => {
          constraints.push(movie);
          return Promise.resolve();
        },
      },
    });
    Object.defineProperty(share.video, 'getSettings', { value: () => ({ displaySurface: 'browser' }) });
    Object.defineProperty(share.video, 'label', { value: 'Series' });
    expect(w.a.controller.getSnapshot().movieMode).toBe(true);
    await connectCall(w);
    const peer = w.a.peers[0]!;
    peer.options.onConnection('connected');

    await w.a.controller.toggleScreenShare();
    expect(constraints).toEqual([true]);
    expect(peer.movieCalls).toEqual([true]);
    expect(peer.screenInfos[0]).toMatchObject({ surface: 'browser', movie: true });

    await w.a.controller.setMovieMode(false);
    expect(saved).toEqual([false]);
    expect(constraints).toEqual([true, false]);
    expect(peer.movieCalls).toEqual([true, false]);
    expect(peer.screenInfos.at(-1)).toMatchObject({ movie: false });
    expect(peer.screenTracks).toHaveLength(1);
    expect(w.a.controller.getSnapshot().movieMode).toBe(false);
  });

  it('only saves the choice when nothing is being shared', async () => {
    const w = await world();
    await connectCall(w);
    const peer = w.a.peers[0]!;
    peer.options.onConnection('connected');
    await w.a.controller.setMovieMode(true);
    expect(w.a.controller.getSnapshot().movieMode).toBe(true);
    expect(peer.movieCalls).toEqual([]);
  });

  it('tracks the remote movie flag for ducking and clears it when the share stops', async () => {
    const w = await world();
    await connectCall(w);
    const peer = w.a.peers[0]!;
    peer.options.onConnection('connected');
    peer.options.onControl({ t: 'screen', on: true, movie: true });
    expect(w.a.controller.getSnapshot().remoteScreenMovie).toBe(true);
    peer.options.onControl({ t: 'screen', on: false });
    expect(w.a.controller.getSnapshot().remoteScreenMovie).toBe(false);
  });
});

describe('socket takeover after reconnect', () => {
  it('silently resyncs instead of showing an error when a heartbeat or signal is refused on a new socket', async () => {
    const w = await world();
    await connectCall(w);
    w.a.peers[0]!.options.onConnection('connected');
    const before = w.a.socket.sent('call:sync').length;
    const callId = w.a.controller.getSnapshot().state.callId;

    w.a.socket.receive('error', { message: 'x', code: 'call.notAllowed', event: 'call:heartbeat', params: { callId } });
    w.a.socket.receive('error', { message: 'x', code: 'call.notAllowed', event: 'call:signal', params: { callId } });

    expect(w.a.socket.sent('call:sync').length).toBe(before + 2);
    expect(w.a.controller.getSnapshot().notice).toBeNull();
    expect(w.a.controller.getSnapshot().state.phase).toBe('active');
  });
});

describe('running in the background', () => {
  class FakeTarget extends EventTarget {
    visibilityState: 'visible' | 'hidden' = 'visible';
  }

  let doc: FakeTarget;
  let win: FakeTarget;

  function backgroundDeps(): Partial<CallControllerDeps> {
    return {
      onPageResume: (handler) =>
        onPageResume(() => handler(), {
          document: doc as unknown as ResumeSource['document'],
          window: win as unknown as ResumeSource['window'],
        }),
    };
  }

  beforeEach(() => {
    doc = new FakeTarget();
    win = new FakeTarget();
  });

  it('keeps the call connected when the page is hidden and timers run late', async () => {
    const w = await world({ alice: backgroundDeps() });
    w.a.socket.connected = true;
    await connectCall(w);
    w.a.peers[0]!.options.onConnection('connected');
    w.b.peers[0]!.options.onConnection('connected');
    const syncs = w.a.socket.sent('call:sync').length;

    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(w.a.controller.getSnapshot().state.phase).toBe('active');
    expect(w.a.peers[0]!.closed).toBe(false);
    expect(w.a.peers[0]!.restarts).toBe(0);
    expect(w.a.socket.sent('call:sync')).toHaveLength(syncs);
  });

  it('resyncs without restarting a healthy connection when the page comes back to the foreground', async () => {
    const w = await world({ alice: backgroundDeps() });
    w.a.socket.connected = true;
    await connectCall(w);
    w.a.peers[0]!.options.onConnection('connected');
    w.b.peers[0]!.options.onConnection('connected');
    const syncs = w.a.socket.sent('call:sync').length;
    const beats = w.a.socket.sent('call:heartbeat').length;
    const peer = w.a.peers[0]!;

    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));

    expect(w.a.socket.sent('call:sync')).toHaveLength(syncs + 1);
    expect(w.a.socket.sent('call:heartbeat')).toHaveLength(beats + 1);
    expect(peer.restarts).toBe(0);
    expect(peer.closed).toBe(false);
    expect(w.a.controller.getSnapshot().state.phase).toBe('active');
  });

  it('recovers from a page freeze through pageshow and resume without hanging up', async () => {
    const w = await world({ alice: backgroundDeps() });
    w.a.socket.connected = true;
    await connectCall(w);
    w.a.peers[0]!.options.onConnection('connected');
    w.b.peers[0]!.options.onConnection('connected');
    const peer = w.a.peers[0]!;

    await vi.advanceTimersByTimeAsync(2 * 60_000);
    win.dispatchEvent(new Event('pageshow'));
    doc.dispatchEvent(new Event('resume'));

    expect(peer.recoveries).toEqual(['resync', 'resync']);
    expect(peer.restarts).toBe(0);
    expect(w.a.socket.sent('call:hangup')).toHaveLength(0);
    expect(w.a.controller.getSnapshot().state.phase).toBe('active');
  });

  it('asks the socket to reconnect on resume and does not queue heartbeats while it is down', async () => {
    const w = await world({ alice: backgroundDeps() });
    w.a.socket.connected = true;
    await connectCall(w);
    w.a.peers[0]!.options.onConnection('connected');
    w.b.peers[0]!.options.onConnection('connected');
    const beats = w.a.socket.sent('call:heartbeat').length;

    w.a.socket.connected = false;
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 6);
    expect(w.a.socket.sent('call:heartbeat')).toHaveLength(beats);

    doc.dispatchEvent(new Event('visibilitychange'));
    expect(w.a.socket.connects).toBe(1);
    expect(w.a.controller.getSnapshot().state.phase).toBe('active');
  });

  function stateFor(w: World, peerLive?: boolean) {
    const callId = w.a.controller.getSnapshot().state.callId;
    return { callId, state: 'active', roomId: 'room-1', kind: 'voice', peerId: 'bob', role: 'caller', ...(peerLive === undefined ? {} : { peerLive }) };
  }

  async function interruptedCall(overrides: Partial<CallControllerDeps> = {}): Promise<World> {
    const w = await world({ alice: { ...backgroundDeps(), isPageHidden: () => doc.visibilityState === 'hidden', ...overrides } });
    w.a.socket.connected = true;
    await connectCall(w);
    w.a.peers[0]!.options.onConnection('connected');
    w.b.peers[0]!.options.onConnection('connected');
    w.a.peers[0]!.options.onConnection('interrupted');
    expect(w.a.controller.getSnapshot().state.phase).toBe('reconnecting');
    return w;
  }

  it('keeps reconnecting while the server says the backgrounded peer can still come back', async () => {
    const w = await interruptedCall();
    w.a.socket.onEmit = (event) => {
      if (event === 'call:sync') {
        w.a.socket.receive('call:state', stateFor(w, true));
      }
    };

    await vi.advanceTimersByTimeAsync(CALL_RECONNECT_TIMEOUT_MS * 4);
    await settle();

    expect(w.a.controller.getSnapshot().state.phase).toBe('reconnecting');
    expect(w.a.socket.sent('call:hangup')).toHaveLength(0);
    expect(w.a.socket.sent('call:sync').length).toBeGreaterThanOrEqual(4);

    w.a.peers[0]!.options.onConnection('connected');
    expect(w.a.controller.getSnapshot().state.phase).toBe('active');
    expect(w.a.peers[0]!.closed).toBe(false);
  });

  it('ends the call once the server says the peer is gone', async () => {
    const w = await interruptedCall();
    let live = true;
    w.a.socket.onEmit = (event) => {
      if (event === 'call:sync') {
        w.a.socket.receive('call:state', stateFor(w, live));
      }
    };
    await vi.advanceTimersByTimeAsync(CALL_RECONNECT_TIMEOUT_MS * 2);
    expect(w.a.controller.getSnapshot().state.phase).toBe('reconnecting');

    live = false;
    await vi.advanceTimersByTimeAsync(CALL_RECONNECT_TIMEOUT_MS);
    await settle();

    expect(w.a.controller.getSnapshot().state).toMatchObject({ phase: 'ended', reason: 'connection-lost' });
    expect(w.a.socket.sent('call:hangup')).toHaveLength(1);
  });

  it('measures the offline window from when the network dropped, not from when reconnecting started', async () => {
    const w = await interruptedCall();
    w.a.socket.onEmit = null;
    await vi.advanceTimersByTimeAsync(CALL_RECONNECT_MAX_MS + 10_000);
    expect(w.a.controller.getSnapshot().state.phase).toBe('reconnecting');

    w.a.socket.connected = false;
    w.a.socket.receive('disconnect', undefined);
    await vi.advanceTimersByTimeAsync(CALL_RECONNECT_TIMEOUT_MS * 2);

    expect(w.a.controller.getSnapshot().state.phase).toBe('reconnecting');
  });

  it('keeps reconnecting against a server that does not report the peer while the network works', async () => {
    const w = await interruptedCall();
    w.a.socket.onEmit = (event) => {
      if (event === 'call:sync') {
        w.a.socket.receive('call:state', stateFor(w));
      }
    };

    await vi.advanceTimersByTimeAsync(CALL_RECONNECT_MAX_MS * 2);
    await settle();

    expect(w.a.controller.getSnapshot().state.phase).toBe('reconnecting');
    expect(w.a.socket.sent('call:hangup')).toHaveLength(0);
  });

  it('never ends a reconnecting call on its own while the network works, however long it takes', async () => {
    const w = await interruptedCall();
    w.a.socket.onEmit = null;

    await vi.advanceTimersByTimeAsync(CALL_RECONNECT_MAX_MS * 3);

    expect(w.a.controller.getSnapshot().state.phase).toBe('reconnecting');
    expect(w.a.peers[0]!.recoveries.filter((reason) => reason === 'resync').length).toBeGreaterThan(3);
    expect(w.a.socket.sent('call:hangup')).toHaveLength(0);
  });

  it('keeps a slow connection attempt alive past the old connect timer while the network works', async () => {
    const w = await world({ alice: backgroundDeps() });
    w.a.socket.connected = true;
    w.b.socket.connected = true;
    await connectCall(w);
    expect(w.a.controller.getSnapshot().state.phase).toBe('connecting');
    w.a.socket.onEmit = null;

    await vi.advanceTimersByTimeAsync(CALL_CONNECT_TIMEOUT_MS * 6);
    expect(w.a.controller.getSnapshot().state.phase).toBe('connecting');

    w.a.peers[0]!.options.onConnection('connected');
    expect(w.a.controller.getSnapshot().state.phase).toBe('active');
  });

  it('ends a connection attempt only after the device has been offline for the whole offline window', async () => {
    const w = await world({ alice: backgroundDeps() });
    w.a.socket.connected = true;
    w.b.socket.connected = true;
    await connectCall(w);
    w.a.socket.connected = false;
    w.a.socket.receive('disconnect', undefined);

    await vi.advanceTimersByTimeAsync(CALL_OFFLINE_MAX_MS - CALL_CONNECT_TIMEOUT_MS);
    expect(w.a.controller.getSnapshot().state.phase).toBe('connecting');
    await vi.advanceTimersByTimeAsync(CALL_CONNECT_TIMEOUT_MS + 1_000);

    expect(w.a.controller.getSnapshot().state).toMatchObject({ phase: 'ended', reason: 'failed' });
  });

  it('restarts recovery and resyncs when the network changes during a call', async () => {
    const changes: Array<() => void> = [];
    const connection = { addEventListener: (type: string, listener: () => void) => type === 'change' && changes.push(listener), removeEventListener: () => undefined };
    vi.stubGlobal('window', { addEventListener: () => undefined, removeEventListener: () => undefined });
    vi.stubGlobal('navigator', { onLine: true, connection });
    try {
      const w = await interruptedCall();
      const recoveries = w.a.peers[0]!.recoveries.length;
      const syncs = w.a.socket.sent('call:sync').length;
      changes.forEach((listener) => listener());

      expect(w.a.peers[0]!.recoveries.length).toBe(recoveries + 1);
      expect(w.a.socket.sent('call:sync').length).toBe(syncs + 1);
      expect(w.a.socket.sent('call:heartbeat').length).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('never gives up on the call while the page is hidden or offline, and resumes when media returns', async () => {
    const w = await interruptedCall();
    w.a.socket.onEmit = null;
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    w.a.socket.connected = false;

    await vi.advanceTimersByTimeAsync(CALL_RECONNECT_MAX_MS - 5_000);
    expect(w.a.controller.getSnapshot().state.phase).toBe('reconnecting');

    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(w.a.socket.connects).toBe(1);
    w.a.socket.connected = true;
    w.a.peers[0]!.options.onConnection('connected');

    expect(w.a.controller.getSnapshot().state.phase).toBe('active');
    expect(w.a.socket.sent('call:hangup')).toHaveLength(0);
    expect(w.a.peers[0]!.closed).toBe(false);
  });

  it('gives up after the longest reconnect window even while hidden', async () => {
    const w = await interruptedCall();
    doc.visibilityState = 'hidden';
    w.a.socket.connected = false;
    w.a.socket.receive('disconnect', undefined);

    await vi.advanceTimersByTimeAsync(CALL_RECONNECT_MAX_MS - 1_000);
    expect(w.a.controller.getSnapshot().state.phase).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(2_000);

    expect(w.a.controller.getSnapshot().state).toMatchObject({ phase: 'ended', reason: 'connection-lost' });
  });

  it('does not end a hidden call when a stale verdict arrives', async () => {
    const w = await interruptedCall();
    w.a.socket.onEmit = (event) => {
      if (event === 'call:sync') {
        doc.visibilityState = 'hidden';
        w.a.socket.receive('call:state', stateFor(w, false));
      }
    };

    await vi.advanceTimersByTimeAsync(CALL_RECONNECT_TIMEOUT_MS);
    await settle();

    expect(w.a.controller.getSnapshot().state.phase).toBe('reconnecting');
  });

  it('ends at the longest offline window when the socket never comes back', async () => {
    const w = await interruptedCall();
    w.a.socket.onEmit = null;
    w.a.socket.connected = false;
    w.a.socket.receive('disconnect', undefined);

    await vi.advanceTimersByTimeAsync(CALL_RECONNECT_MAX_MS - 1_000);
    expect(w.a.controller.getSnapshot().state.phase).toBe('reconnecting');

    await vi.advanceTimersByTimeAsync(2_000);
    expect(w.a.controller.getSnapshot().state).toMatchObject({ phase: 'ended', reason: 'connection-lost' });
    expect(w.a.socket.sent('call:hangup')).toHaveLength(1);
  });

  it('lets the user hang up during an extended reconnect and stops extending', async () => {
    const w = await interruptedCall();
    doc.visibilityState = 'hidden';
    w.a.socket.onEmit = null;
    await vi.advanceTimersByTimeAsync(CALL_RECONNECT_TIMEOUT_MS * 2);
    expect(w.a.controller.getSnapshot().state.phase).toBe('reconnecting');

    w.a.controller.hangup();
    expect(w.a.controller.getSnapshot().state).toMatchObject({ phase: 'ended', reason: 'completed' });
    expect(w.a.socket.sent('call:hangup')).toHaveLength(1);
    expect(w.a.peers[0]!.closed).toBe(true);

    const syncs = w.a.socket.sent('call:sync').length;
    await vi.advanceTimersByTimeAsync(CALL_RECONNECT_MAX_MS);
    expect(w.a.socket.sent('call:hangup')).toHaveLength(1);
    expect(w.a.socket.sent('call:sync')).toHaveLength(syncs);
    expect(w.a.controller.getSnapshot().state.phase).toBe('idle');
  });

  it('does nothing when disposed while a reconnect extension is pending', async () => {
    const w = await interruptedCall();
    doc.visibilityState = 'hidden';
    w.a.socket.onEmit = null;
    await vi.advanceTimersByTimeAsync(CALL_RECONNECT_TIMEOUT_MS + 1_000);

    w.a.controller.dispose();
    const emitted = w.a.socket.emitted.length;
    await vi.advanceTimersByTimeAsync(CALL_RECONNECT_MAX_MS * 2);

    expect(w.a.socket.emitted.length).toBe(emitted);
  });

  it('does nothing on resume when there is no call', async () => {
    const w = await world({ alice: backgroundDeps() });
    w.a.socket.connected = true;
    const syncs = w.a.socket.sent('call:sync').length;
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(w.a.socket.sent('call:sync')).toHaveLength(syncs);
    expect(w.a.socket.connects).toBe(0);
  });
});

describe('voice leveling', () => {
  interface FakeLeveler extends VoiceLeveler {
    inputs: unknown[];
    volumes: number[];
    mutes: boolean[];
    lights: boolean[];
    closed: number;
  }

  function micMedia() {
    const mic = { kind: 'audio', enabled: true, stopped: false, stop() { this.stopped = true; } };
    const tracks: unknown[] = [mic];
    const stream = {
      getTracks: () => tracks,
      getAudioTracks: () => tracks.filter((track) => (track as { kind: string }).kind === 'audio'),
      getVideoTracks: () => [],
      addTrack: (track: unknown) => tracks.push(track),
      removeTrack: (track: unknown) => tracks.splice(tracks.indexOf(track), 1),
    } as unknown as MediaStream;
    return { mic, stream };
  }

  function fakeLeveler(processed: boolean): FakeLeveler {
    const output = { kind: 'audio', id: 'leveled', enabled: true } as unknown as MediaStreamTrack;
    const sendStream = { id: 'send', getAudioTracks: () => [output] } as unknown as MediaStream;
    const leveler: FakeLeveler = {
      track: output,
      processed,
      inputs: [],
      volumes: [],
      mutes: [],
      lights: [],
      closed: 0,
      sendStream: () => sendStream,
      setInput: (track) => {
        leveler.inputs.push(track);
        return output;
      },
      setVolume: (volume) => void leveler.volumes.push(volume),
      setMuted: (muted) => void leveler.mutes.push(muted),
      setLight: (light) => void leveler.lights.push(light),
      close: () => void (leveler.closed += 1),
    };
    return leveler;
  }

  async function leveledCall(processed = true) {
    const media = micMedia();
    const levelers: FakeLeveler[] = [];
    const sentTracks: unknown[] = [];
    const w = await world({
      alice: {
        acquireMedia: () => Promise.resolve({ stream: media.stream, cameraFailed: false }),
        createVoiceLeveler: (track) => {
          const leveler = fakeLeveler(processed);
          leveler.inputs.push(track);
          levelers.push(leveler);
          return leveler;
        },
        createPeerSession: (options) => {
          const peer = new FakePeer(options);
          peer.setAudioTrack = (track?: MediaStreamTrack) => {
            sentTracks.push(track);
            return Promise.resolve();
          };
          w.a.peers.push(peer);
          return peer;
        },
      },
    });
    await connectCall(w);
    return { w, media, levelers, sentTracks, peer: w.a.peers[0]! };
  }

  it('lightens video and voice processing under cpu load from the regular stats tick and recovers later', async () => {
    const media = micMedia();
    const levelers: FakeLeveler[] = [];
    let pressure: 'nominal' | 'serious' = 'nominal';
    let stopped = 0;
    const w = await world({
      alice: {
        acquireMedia: () => Promise.resolve({ stream: media.stream, cameraFailed: false }),
        createVoiceLeveler: () => {
          const leveler = fakeLeveler(true);
          levelers.push(leveler);
          return leveler;
        },
        watchPressure: () => ({ current: () => pressure, stop: () => void (stopped += 1) }),
      },
    });
    await connectCall(w);
    const peer = w.a.peers[0]!;
    peer.options.onConnection('connected');
    let cpu = 0;
    let total = 10;
    const tick = async (cpuSeconds: number) => {
      cpu += cpuSeconds;
      total += 2;
      peer.statsReport = new Map([['out', { type: 'outbound-rtp', kind: 'video', mid: '2', qualityLimitationDurations: { cpu, none: total - cpu } }]]);
      await vi.advanceTimersByTimeAsync(2_000);
    };

    await tick(0);
    await tick(2);
    await tick(2);
    expect(peer.loadLevels.at(-1)).toBe(1);
    await tick(2);
    await tick(2);
    expect(peer.loadLevels.at(-1)).toBe(2);
    await tick(0);
    expect(levelers[0]!.lights.at(-1)).toBe(true);

    pressure = 'serious';
    await tick(0);
    await tick(0);
    expect(peer.loadLevels.at(-1)).toBe(3);

    pressure = 'nominal';
    for (let index = 0; index < 40; index += 1) {
      await tick(0);
    }
    expect(peer.loadLevels.at(-1)).toBe(0);

    w.a.controller.hangup();
    await vi.advanceTimersByTimeAsync(0);
    expect(stopped).toBeGreaterThan(0);
  });

  it('sends the raw microphone with browser processing while light, meters it for the self ring, and goes back to the leveled voice later', async () => {
    const media = micMedia();
    const levelers: FakeLeveler[] = [];
    const sent: unknown[] = [];
    let pressure: 'nominal' | 'critical' = 'critical';
    const w = await world({
      alice: {
        acquireMedia: () => Promise.resolve({ stream: media.stream, cameraFailed: false }),
        createVoiceLeveler: () => {
          const leveler = fakeLeveler(true);
          levelers.push(leveler);
          return leveler;
        },
        watchPressure: () => ({ current: () => pressure, stop: () => undefined }),
        createPeerSession: (options) => {
          const peer = new FakePeer(options);
          peer.setAudioTrack = (track?: MediaStreamTrack) => {
            sent.push(track);
            return Promise.resolve();
          };
          w.a.peers.push(peer);
          return peer;
        },
      },
    });
    await connectCall(w);
    const peer = w.a.peers[0]!;
    let failNext = true;
    peer.setAudioTrack = (track?: MediaStreamTrack) => {
      if (failNext) {
        failNext = false;
        return Promise.reject(new Error('busy'));
      }
      sent.push(track);
      return Promise.resolve();
    };
    peer.options.onConnection('connected');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(levelers[0]!.lights).toEqual([]);
    expect(w.a.controller.getSnapshot().voiceTrack).toBe(levelers[0]!.track);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(levelers[0]!.lights).toEqual([true]);
    expect(w.a.controller.getSnapshot().voiceTrack).toBeNull();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(sent).toHaveLength(1);

    pressure = 'nominal';
    await vi.advanceTimersByTimeAsync(70_000);
    expect(levelers[0]!.lights.at(-1)).toBe(false);
    expect(sent.at(-1)).toBe(levelers[0]!.track);
    expect(w.a.controller.getSnapshot().voiceTrack).toBe(levelers[0]!.track);
  });

  it('asks the sharer for a key frame when the shared screen stops decoding while packets still arrive', async () => {
    const w = await world({ alice: { watchPressure: () => ({ current: () => null, stop: () => undefined }) } });
    await connectCall(w);
    const peer = w.a.peers[0]!;
    peer.options.onConnection('connected');
    const screenTrack = { kind: 'video', id: 'remote-screen', readyState: 'live' } as unknown as MediaStreamTrack;
    peer.options.onControl({ t: 'screen', on: true });
    peer.options.onRemoteScreen({ id: 'screen', getTracks: () => [screenTrack], getVideoTracks: () => [screenTrack], getAudioTracks: () => [] } as unknown as MediaStream);
    expect(w.a.controller.getSnapshot().remoteScreenStream?.getVideoTracks()[0]?.id).toBe('remote-screen');
    let packets = 100;
    const tick = async () => {
      packets += 50;
      peer.statsReport = new Map([['in', { type: 'inbound-rtp', kind: 'video', trackIdentifier: 'remote-screen', framesDecoded: 40, packetsReceived: packets }]]);
      await vi.advanceTimersByTimeAsync(2_000);
    };
    await tick();
    await tick();
    expect(peer.keyFrameRequests).toBe(0);
    await tick();
    await tick();
    expect(peer.keyFrameRequests).toBe(1);
  });

  it('sends the leveled microphone instead of the raw track', async () => {
    const { media, levelers, peer } = await leveledCall();

    expect(levelers).toHaveLength(1);
    expect(levelers[0]!.inputs).toEqual([media.mic]);
    expect(peer.options.localStream?.getAudioTracks()).toEqual([levelers[0]!.track]);
  });

  it('keeps the raw stream when the leveler cannot process audio', async () => {
    const { media, levelers, peer } = await leveledCall(false);

    expect(peer.options.localStream).toBe(media.stream);
    expect(levelers[0]!.closed).toBe(1);
  });

  it('exposes the leveled voice so the self speaking ring hears what the peer hears', async () => {
    const { w, levelers } = await leveledCall();

    expect(w.a.controller.getSnapshot().voiceTrack).toBe(levelers[0]!.track);

    await w.a.controller.toggleCamera();
    expect(w.a.controller.getSnapshot().voiceTrack).toBe(levelers[0]!.track);

    w.a.controller.hangup();
    expect(w.a.controller.getSnapshot().voiceTrack).toBeNull();
  });

  it('has no leveled voice when the leveler cannot process audio', async () => {
    const { w } = await leveledCall(false);

    expect(w.a.controller.getSnapshot().voiceTrack).toBeNull();
  });

  it('mutes the leveled output while keeping the raw track alive', async () => {
    const { w, media, levelers, peer } = await leveledCall();

    w.a.controller.toggleMute();

    expect(levelers[0]!.mutes.at(-1)).toBe(true);
    expect(peer.muted).toBe(true);
    expect(media.mic.enabled).toBe(false);
    expect(media.mic.stopped).toBe(false);

    w.a.controller.toggleMute();
    expect(levelers[0]!.mutes.at(-1)).toBe(false);
    expect(media.mic.enabled).toBe(true);
  });

  it('applies the microphone volume live', async () => {
    const { w, levelers } = await leveledCall();

    w.a.controller.setMicVolume(1.5);

    expect(levelers[0]!.volumes).toEqual([1.5]);
  });

  it('rewires a new microphone into the leveler and keeps sending the leveled track', async () => {
    const { w, media, levelers, sentTracks } = await leveledCall();
    const next = { kind: 'audio', enabled: true, stop: () => undefined } as unknown as MediaStreamTrack;

    w.a.controller.toggleMute();
    await w.a.controller.replaceAudioInput(next);

    expect(media.mic.stopped).toBe(true);
    expect(levelers[0]!.inputs.at(-1)).toBe(next);
    expect(next.enabled).toBe(false);
    expect(sentTracks).toEqual([levelers[0]!.track]);
  });

  it('closes the leveler when the call ends', async () => {
    const { w, levelers } = await leveledCall();

    w.a.controller.hangup();
    await settle();

    expect(levelers[0]!.closed).toBe(1);
    w.a.controller.setMicVolume(2);
    expect(levelers[0]!.volumes).toEqual([]);
  });
});

describe('live device switching', () => {
  interface FakeTrack {
    kind: string;
    label: string;
    enabled: boolean;
    muted: boolean;
    readyState: string;
    stop: () => void;
    addEventListener: (type: string, listener: () => void) => void;
    removeEventListener: (type: string, listener: () => void) => void;
    fire: (type: string) => void;
  }

  function fakeTrack(kind: string, label: string, log: string[]): FakeTrack {
    const listeners = new Map<string, Set<() => void>>();
    const track: FakeTrack = {
      kind,
      label,
      enabled: true,
      muted: false,
      readyState: 'live',
      stop: () => {
        track.readyState = 'ended';
        log.push(`stop ${label}`);
      },
      addEventListener: (type, listener) => {
        listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
      },
      removeEventListener: (type, listener) => {
        listeners.get(type)?.delete(listener);
      },
      fire: (type) => {
        for (const listener of [...(listeners.get(type) ?? [])]) {
          listener();
        }
      },
    };
    return track;
  }

  function liveStream(initial: FakeTrack[]) {
    const tracks: FakeTrack[] = [...initial];
    return {
      tracks,
      stream: {
        getTracks: () => [...tracks],
        getAudioTracks: () => tracks.filter((track) => track.kind === 'audio'),
        getVideoTracks: () => tracks.filter((track) => track.kind === 'video'),
        addTrack: (track: FakeTrack) => void tracks.push(track),
        removeTrack: (track: FakeTrack) => void tracks.splice(tracks.indexOf(track), 1),
      } as unknown as MediaStream,
    };
  }

  async function cameraCall(options: { cameras?: Array<FakeTrack | null>; mics?: Array<FakeTrack | null>; leveler?: VoiceLeveler } = {}) {
    const log: string[] = [];
    const mic = fakeTrack('audio', 'mic-a', log);
    const camera = fakeTrack('video', 'cam-a', log);
    const media = liveStream([mic, camera]);
    const cameras = options.cameras ?? [];
    const mics = options.mics ?? [];
    const w = await world({
      alice: {
        acquireMedia: () => Promise.resolve({ stream: media.stream, cameraFailed: false }),
        acquireCamera: () => {
          log.push('acquire camera');
          return Promise.resolve((cameras.shift() ?? null) as unknown as MediaStreamTrack | null);
        },
        acquireMicrophone: () => {
          log.push('acquire mic');
          return Promise.resolve((mics.shift() ?? null) as unknown as MediaStreamTrack | null);
        },
        ...(options.leveler ? { createVoiceLeveler: () => options.leveler! } : {}),
        createPeerSession: (peerOptions) => {
          const peer = new FakePeer(peerOptions);
          peer.setVideoTrack = (track) => {
            peer.videoTrack = track;
            log.push(`send video ${(track as unknown as FakeTrack | null)?.label ?? 'none'}`);
            return Promise.resolve();
          };
          peer.setAudioTrack = (track?: MediaStreamTrack) => {
            log.push(`send audio ${(track as unknown as FakeTrack | undefined)?.label ?? 'none'}`);
            return Promise.resolve();
          };
          w.a.peers.push(peer);
          return peer;
        },
      },
    });
    await connectCall(w, 'video');
    w.a.peers[0]!.options.onConnection('connected');
    log.length = 0;
    return { w, log, mic, camera, media, peer: w.a.peers[0]! };
  }

  it('reopens the camera when the system ends the camera track', async () => {
    const next = fakeTrack('video', 'cam-b', []);
    const call = await cameraCall({ cameras: [next] });

    call.camera.readyState = 'ended';
    call.camera.fire('ended');
    await settle();

    expect(call.log).toContain('acquire camera');
    expect(call.peer.videoTrack).toBe(next);
    expect(call.media.tracks).toContain(next);
    expect(call.media.tracks).not.toContain(call.camera);
    expect(call.w.a.controller.getSnapshot()).toMatchObject({ cameraOn: true, cameraFailed: false });
  });

  it('turns the camera off and clears the preview when the ended camera cannot be reopened', async () => {
    const call = await cameraCall({ cameras: [null, null] });

    call.camera.readyState = 'ended';
    call.camera.fire('ended');
    await settle();

    expect(call.peer.videoTrack).toBeNull();
    expect(call.media.tracks.some((track) => track.kind === 'video')).toBe(false);
    expect(call.w.a.controller.getSnapshot()).toMatchObject({ cameraOn: false, cameraFailed: true });
  });

  it('watches a camera installed later and ignores a camera that was already replaced', async () => {
    const next = fakeTrack('video', 'cam-b', []);
    const last = fakeTrack('video', 'cam-c', []);
    const call = await cameraCall({ cameras: [next, last] });
    await call.w.a.controller.switchCamera();
    call.log.length = 0;

    call.camera.fire('ended');
    await settle();
    expect(call.log).toEqual([]);

    next.readyState = 'ended';
    next.fire('ended');
    await settle();
    expect(call.peer.videoTrack).toBe(last);
    expect(call.media.tracks).toContain(last);
  });

  it('reopens a camera the system keeps muted while the call is on screen', async () => {
    const next = fakeTrack('video', 'cam-b', []);
    const call = await cameraCall({ cameras: [next] });

    call.camera.muted = true;
    call.camera.fire('mute');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(call.log).toEqual([]);
    await vi.advanceTimersByTimeAsync(2_000);

    expect(call.peer.videoTrack).toBe(next);
    expect(call.media.tracks).not.toContain(call.camera);
  });

  it('leaves a camera that unmutes on its own alone', async () => {
    const call = await cameraCall({ cameras: [fakeTrack('video', 'cam-b', [])] });

    call.camera.muted = true;
    call.camera.fire('mute');
    await vi.advanceTimersByTimeAsync(500);
    call.camera.muted = false;
    call.camera.fire('unmute');
    await vi.advanceTimersByTimeAsync(5_000);

    expect(call.log).toEqual([]);
    expect(call.media.tracks).toContain(call.camera);
  });

  it('drops a device change camera when the camera was toggled while it was opening', async () => {
    const call = await cameraCall();
    let release: (track: MediaStreamTrack | null) => void = () => undefined;
    const late = fakeTrack('video', 'cam-late', []);
    const fresh = fakeTrack('video', 'cam-fresh', []);
    const cameras: Array<Promise<MediaStreamTrack | null>> = [
      new Promise((resolve) => (release = resolve)),
      Promise.resolve(fresh as unknown as MediaStreamTrack),
    ];
    call.w.a.deps.acquireCamera = () => cameras.shift() ?? Promise.resolve(null);

    const swapping = call.w.a.controller.switchCamera();
    await settle();
    await call.w.a.controller.toggleCamera();
    await call.w.a.controller.toggleCamera();
    release(late as unknown as MediaStreamTrack);
    await swapping;

    expect(late.readyState).toBe('ended');
    expect(call.media.tracks.filter((track) => track.kind === 'video')).toEqual([fresh]);
    expect(call.peer.videoTrack).toBe(fresh);
    expect(call.w.a.controller.getSnapshot().cameraOn).toBe(true);
  });

  it('switches the camera instantly on the existing sender and stops the old camera only after the new one is sent', async () => {
    const next = fakeTrack('video', 'cam-b', []);
    const call = await cameraCall({ cameras: [next] });
    expect(call.w.a.controller.getSnapshot().cameraOn).toBe(true);

    await call.w.a.controller.switchCamera();

    expect(call.log).toEqual(['acquire camera', 'send video cam-b', 'stop cam-a']);
    expect(call.media.tracks).toContain(next);
    expect(call.media.tracks).not.toContain(call.camera);
    expect(call.w.a.controller.getSnapshot()).toMatchObject({ cameraOn: true, cameraFailed: false });
    expect(call.w.a.controller.getSnapshot().localStream).toBe(call.media.stream);
    expect(call.w.a.socket.sent('call:hangup')).toHaveLength(0);
  });

  it('releases the old camera and retries when the device cannot open two cameras at once, as phones do', async () => {
    const next = fakeTrack('video', 'cam-back', []);
    const call = await cameraCall({ cameras: [null, next] });

    await call.w.a.controller.switchCamera();

    expect(call.log).toEqual(['acquire camera', 'stop cam-a', 'acquire camera', 'send video cam-back']);
    expect(call.media.tracks).toContain(next);
    expect(call.w.a.controller.getSnapshot().cameraOn).toBe(true);
  });

  it('turns the camera off cleanly when no camera can be opened at all', async () => {
    const call = await cameraCall({ cameras: [null, null] });

    await call.w.a.controller.switchCamera();

    expect(call.peer.videoTrack).toBeNull();
    expect(call.media.tracks.some((track) => track.kind === 'video')).toBe(false);
    expect(call.w.a.controller.getSnapshot()).toMatchObject({ cameraOn: false, cameraFailed: true });
  });

  it('does not open a camera when the camera is off, the choice applies when it is turned on', async () => {
    const call = await cameraCall({ cameras: [fakeTrack('video', 'cam-b', [])] });
    await call.w.a.controller.toggleCamera();
    call.log.length = 0;

    await call.w.a.controller.switchCamera();

    expect(call.log).toEqual([]);
  });

  it('stops a camera that finishes starting after the call ended and never sends it', async () => {
    const call = await cameraCall();
    await call.w.a.controller.toggleCamera();
    let release: (track: MediaStreamTrack | null) => void = () => undefined;
    call.w.a.deps.acquireCamera = () => new Promise((resolve) => (release = resolve));
    call.peer.setVideoTrack = (track) => (call.peer.closed ? Promise.reject(new Error('The peer connection is closed.')) : ((call.peer.videoTrack = track), Promise.resolve()));
    const late = fakeTrack('video', 'cam-late', call.log);

    const pending = call.w.a.controller.toggleCamera();
    call.w.a.controller.hangup();
    await settle();
    release(late as unknown as MediaStreamTrack);
    await pending;

    expect(late.readyState).toBe('ended');
    expect(call.peer.videoTrack).not.toBe(late);
    expect(call.media.tracks).not.toContain(late);
    expect(call.w.a.controller.getSnapshot().cameraOn).toBe(false);
  });

  it('turns the camera back off when sending the new camera fails instead of rejecting', async () => {
    const call = await cameraCall({ cameras: [fakeTrack('video', 'cam-b', [])] });
    await call.w.a.controller.toggleCamera();
    call.peer.setVideoTrack = () => Promise.reject(new Error('replaceTrack failed'));
    const next = fakeTrack('video', 'cam-c', []);
    call.w.a.deps.acquireCamera = () => Promise.resolve(next as unknown as MediaStreamTrack);

    await expect(call.w.a.controller.toggleCamera()).resolves.toBeUndefined();

    expect(next.readyState).toBe('ended');
    expect(call.media.tracks).not.toContain(next);
    expect(call.w.a.controller.getSnapshot()).toMatchObject({ cameraOn: false, cameraFailed: true });
  });

  it('does not turn the camera back on when it was switched off while a new camera was being installed', async () => {
    const call = await cameraCall();
    let release: () => void = () => undefined;
    const sent: unknown[] = [];
    call.peer.setVideoTrack = (track) => {
      sent.push(track);
      if (track === null) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => (release = resolve));
    };
    const next = fakeTrack('video', 'cam-b', []);

    const replacing = call.w.a.controller.replaceVideoInput(next as unknown as MediaStreamTrack);
    await settle();
    const off = call.w.a.controller.toggleCamera();
    release();
    await Promise.all([replacing, off]);

    expect(call.w.a.controller.getSnapshot().cameraOn).toBe(false);
    expect(next.readyState).toBe('ended');
    expect(call.media.tracks.some((track) => track.kind === 'video')).toBe(false);
  });

  it('keeps the newest choice when the camera is switched twice quickly', async () => {
    const second = fakeTrack('video', 'cam-b', []);
    const third = fakeTrack('video', 'cam-c', []);
    const call = await cameraCall({ cameras: [second, third] });

    await Promise.all([call.w.a.controller.switchCamera(), call.w.a.controller.switchCamera()]);

    expect(call.media.tracks.filter((track) => track.kind === 'video')).toEqual([third]);
    expect(second.readyState).toBe('ended');
    expect(call.peer.videoTrack).toBe(third);
  });

  it('switches the microphone live, keeping the mute state, before stopping the old one', async () => {
    const next = fakeTrack('audio', 'mic-b', []);
    const call = await cameraCall({ mics: [next] });
    call.w.a.controller.toggleMute();
    call.log.length = 0;

    await call.w.a.controller.switchMicrophone();

    expect(call.log).toEqual(['acquire mic', 'send audio mic-b', 'stop mic-a']);
    expect(next.enabled).toBe(false);
    expect(call.media.tracks).toContain(next);
    expect(call.w.a.controller.getSnapshot().muted).toBe(true);
  });

  it('routes a new microphone through the existing processing chain', async () => {
    const next = fakeTrack('audio', 'mic-b', []);
    const inputs: unknown[] = [];
    const output = { kind: 'audio', label: 'leveled', enabled: true } as unknown as MediaStreamTrack;
    const leveler: VoiceLeveler = {
      track: output,
      processed: true,
      sendStream: () => ({ getAudioTracks: () => [output], getVideoTracks: () => [], getTracks: () => [output] }) as unknown as MediaStream,
      setInput: (track) => {
        inputs.push(track);
        return output;
      },
      setVolume: () => undefined,
      setMuted: () => undefined,
      setLight: () => undefined,
      close: () => undefined,
    };
    const call = await cameraCall({ mics: [next], leveler });

    await call.w.a.controller.switchMicrophone();

    expect(inputs).toEqual([next]);
    expect(call.log).toEqual(['acquire mic', 'send audio leveled', 'stop mic-a']);
  });

  it('rewires the old microphone into the processing chain when sending the new one fails', async () => {
    const next = fakeTrack('audio', 'mic-b', []);
    const inputs: unknown[] = [];
    const output = { kind: 'audio', label: 'leveled', enabled: true } as unknown as MediaStreamTrack;
    const leveler: VoiceLeveler = {
      track: output,
      processed: true,
      sendStream: () => ({ getAudioTracks: () => [output], getVideoTracks: () => [], getTracks: () => [output] }) as unknown as MediaStream,
      setInput: (track) => {
        inputs.push(track);
        return output;
      },
      setVolume: () => undefined,
      setMuted: () => undefined,
      setLight: () => undefined,
      close: () => undefined,
    };
    const call = await cameraCall({ mics: [next], leveler });
    call.peer.setAudioTrack = () => Promise.reject(new Error('replace failed'));

    await call.w.a.controller.switchMicrophone();

    expect(inputs).toEqual([next, call.mic]);
    expect(next.readyState).toBe('ended');
    expect(call.mic.readyState).toBe('live');
    expect(call.media.tracks).toContain(call.mic);
  });

  it('turns the camera off cleanly when the retry opened a camera but sending it fails', async () => {
    const next = fakeTrack('video', 'cam-back', []);
    const call = await cameraCall({ cameras: [null, next] });
    const original = call.peer.setVideoTrack.bind(call.peer);
    call.peer.setVideoTrack = (track) => (track ? Promise.reject(new Error('replace failed')) : original(track));

    await call.w.a.controller.switchCamera();

    expect(next.readyState).toBe('ended');
    expect(call.media.tracks.some((track) => track.kind === 'video')).toBe(false);
    expect(call.peer.videoTrack).toBeNull();
    expect(call.w.a.controller.getSnapshot()).toMatchObject({ cameraOn: false, cameraFailed: true });
  });

  it('keeps the old camera when sending the new one fails and the old one is still open', async () => {
    const next = fakeTrack('video', 'cam-b', []);
    const call = await cameraCall({ cameras: [next] });
    call.peer.setVideoTrack = () => Promise.reject(new Error('replace failed'));

    await call.w.a.controller.switchCamera();

    expect(next.readyState).toBe('ended');
    expect(call.camera.readyState).toBe('live');
    expect(call.w.a.controller.getSnapshot().cameraOn).toBe(true);
  });

  it('keeps the old microphone when no other microphone can be opened even after releasing it', async () => {
    const call = await cameraCall({ mics: [null, null] });

    await call.w.a.controller.switchMicrophone();

    expect(call.log).toEqual(['acquire mic']);
    expect(call.mic.readyState).toBe('live');
    expect(call.media.tracks).toContain(call.mic);
  });
});

describe('changing the shared screen', () => {
  it('swaps the shared source on the same sender without stopping the share', async () => {
    const first = screenStream();
    const second = screenStream(false);
    const screens = [first.stream, second.stream];
    const w = await world({ alice: { acquireScreen: () => Promise.resolve(screens.shift() ?? null), stopMedia: (stream) => { for (const track of stream?.getTracks() ?? []) { track.stop(); } } } });
    await connectCall(w);
    w.a.peers[0]!.options.onConnection('connected');
    w.b.peers[0]!.options.onConnection('connected');
    await w.a.controller.toggleScreenShare();
    const peer = w.a.peers[0]!;

    await w.a.controller.changeScreenSource();

    expect(peer.screenTracks.at(-1)).toEqual({ video: second.video, audio: null });
    expect(peer.screenTracks.some((entry) => entry.video === null)).toBe(false);
    expect(first.video.stopped).toBe(true);
    expect(second.video.stopped).toBe(false);
    expect(w.a.controller.getSnapshot()).toMatchObject({ screenSharing: true, localScreenStream: second.stream, shareAudio: false });

    first.end();
    await settle();
    expect(w.a.controller.getSnapshot().screenSharing).toBe(true);
    second.end();
    await settle();
    expect(w.a.controller.getSnapshot().screenSharing).toBe(false);
  });

  it('releases the new capture when preparing it throws and allows another try', async () => {
    const first = screenStream();
    const second = screenStream();
    const third = screenStream(false);
    const screens = [first.stream, second.stream, third.stream];
    let fail = false;
    const w = await world({
      alice: {
        acquireScreen: () => Promise.resolve(screens.shift() ?? null),
        applyShareConstraints: () => (fail ? Promise.reject(new Error('constraints')) : Promise.resolve()),
        stopMedia: (stream) => {
          for (const track of stream?.getTracks() ?? []) {
            track.stop();
          }
        },
      },
    });
    await connectCall(w);
    w.a.peers[0]!.options.onConnection('connected');
    await w.a.controller.toggleScreenShare();
    fail = true;

    await w.a.controller.changeScreenSource();

    expect(second.video.stopped).toBe(true);
    expect(first.video.stopped).toBe(false);
    expect(w.a.controller.getSnapshot().localScreenStream).toBe(first.stream);
    fail = false;
    await w.a.controller.changeScreenSource();
    expect(w.a.controller.getSnapshot().localScreenStream).toBe(third.stream);
  });

  it('keeps the current share when picking another source is cancelled', async () => {
    const first = screenStream();
    const screens: Array<MediaStream | null> = [first.stream, null];
    const w = await world({ alice: { acquireScreen: () => Promise.resolve(screens.shift() ?? null) } });
    await connectCall(w);
    w.a.peers[0]!.options.onConnection('connected');
    await w.a.controller.toggleScreenShare();

    await w.a.controller.changeScreenSource();

    expect(first.video.stopped).toBe(false);
    expect(w.a.controller.getSnapshot()).toMatchObject({ screenSharing: true, localScreenStream: first.stream });
  });
});

describe('call transfer between devices', () => {
  async function transferWorld() {
    const w = await world();
    await connectCall(w);
    w.a.peers[0]!.options.onConnection('connected');
    w.b.peers[0]!.options.onConnection('connected');
    const callId = w.a.controller.getSnapshot().state.callId!;
    const connectedAt = w.b.controller.getSnapshot().state.connectedAt;
    const a2 = makeNode(w.alice, () => Promise.resolve({ peer: w.bob.pinned }));
    a2.socket.receive('call:config', { enabled: true, relayAvailable: false });
    a2.socket.onEmit = (event, payload) => {
      if (event === 'call:ice-servers') {
        a2.socket.receive('call:ice-servers-result', { callId: payload.callId, ...SERVER_ICE });
      }
    };
    a2.socket.receive('call:state', { callId, state: 'active', roomId: 'room-1', kind: 'voice', peerId: 'bob', role: 'caller', answeredAt: new Date(1_000).toISOString() });
    await settle();
    return { w, a2, callId, connectedAt };
  }

  it('shows the passive state with everything needed to switch, then sends a signed transfer from the new device', async () => {
    const { a2, callId } = await transferWorld();
    expect(a2.controller.getSnapshot().otherDevice).toMatchObject({ callId, role: 'caller', roomId: 'room-1', answeredAt: new Date(1_000).toISOString() });

    await a2.controller.transferHere();
    await settle();

    const sent = a2.socket.sent('call:transfer');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ callId });
    expect(typeof sent[0]!.envelope).toBe('string');
    expect(a2.controller.getSnapshot()).toMatchObject({ otherDevice: null, state: { phase: 'reconnecting', callId, connectedAt: 1_000 } });
    expect(a2.peers).toHaveLength(0);
  });

  it('runs a fresh authenticated handshake: the peer replaces its session and old device signals are ignored', async () => {
    const { w, a2, callId, connectedAt } = await transferWorld();
    const oldPeerOfBob = w.b.peers[0]!;
    const oldAliceSend = w.a.peers[0]!.options.sendSignal;
    await a2.controller.transferHere();
    await settle();
    const envelope = a2.socket.sent('call:transfer')[0]!.envelope as string;

    w.b.socket.receive('call:peer-transfer', { callId, from: 'alice', envelope });
    await settle();
    expect(oldPeerOfBob.closed).toBe(true);
    expect(w.b.peers).toHaveLength(2);
    expect(w.b.controller.getSnapshot().state).toMatchObject({ phase: 'reconnecting', connectedAt });
    const accept = w.b.socket.sent('call:transfer-accept');
    expect(accept).toHaveLength(1);

    w.b.socket.receive('call:peer-transfer', { callId, from: 'alice', envelope });
    await settle();
    expect(w.b.peers).toHaveLength(2);

    a2.socket.receive('call:transfer-accepted', { callId, envelope: accept[0]!.envelope });
    await settle();
    expect(a2.peers).toHaveLength(1);
    expect(a2.peers[0]!.options.role).toBe('caller');

    const relayed: string[] = [];
    a2.socket.onEmit = (event, payload) => {
      if (event === 'call:signal') relayed.push(payload.envelope as string);
      if (event === 'call:ice-servers') a2.socket.receive('call:ice-servers-result', { callId: payload.callId, ...SERVER_ICE });
    };
    a2.peers[0]!.options.sendSignal('offer', { description: { type: 'offer', sdp: 'v=0' } });
    await settle();
    w.b.socket.receive('call:signal', { callId, from: 'alice', envelope: relayed[0] });
    await settle();
    expect(w.b.peers[1]!.received.map((entry) => entry.type)).toEqual(['offer']);

    const stale: string[] = [];
    w.a.socket.onEmit = (event, payload) => {
      if (event === 'call:signal') stale.push(payload.envelope as string);
    };
    oldAliceSend('offer', { description: { type: 'offer', sdp: 'old' } });
    await settle();
    w.b.socket.receive('call:signal', { callId, from: 'alice', envelope: stale[0] });
    await settle();
    expect(w.b.peers[1]!.received).toHaveLength(1);

    w.b.peers[1]!.options.onConnection('connected');
    expect(w.b.controller.getSnapshot().state).toMatchObject({ phase: 'active', connectedAt });
  });

  async function sharingTransfer() {
    const share = screenStream();
    const w = await world({ bob: { acquireScreen: () => Promise.resolve(share.stream), stopMedia: (stream) => { for (const track of stream?.getTracks() ?? []) { track.stop(); } } } });
    await connectCall(w);
    w.a.peers[0]!.options.onConnection('connected');
    w.b.peers[0]!.options.onConnection('connected');
    await w.b.controller.toggleScreenShare();
    expect(w.b.controller.getSnapshot().screenSharing).toBe(true);
    const callId = w.a.controller.getSnapshot().state.callId!;
    const a2 = makeNode(w.alice, () => Promise.resolve({ peer: w.bob.pinned }));
    a2.socket.receive('call:config', { enabled: true, relayAvailable: false });
    a2.socket.receive('call:state', { callId, state: 'active', roomId: 'room-1', kind: 'voice', peerId: 'bob', role: 'caller', answeredAt: new Date(1_000).toISOString() });
    await settle();
    await a2.controller.transferHere();
    await settle();
    w.b.socket.receive('call:peer-transfer', { callId, from: 'alice', envelope: a2.socket.sent('call:transfer')[0]!.envelope });
    await settle();
    return { w, share };
  }

  it('keeps sharing the screen when the other person moves to another device and re-sends it on the new connection', async () => {
    const { w, share } = await sharingTransfer();
    expect(w.b.controller.getSnapshot()).toMatchObject({ screenSharing: true, notice: null });
    expect(share.video.stopped).toBe(false);
    const fresh = w.b.peers[1]!;
    expect(fresh.screenTracks).toEqual([]);

    fresh.options.onControl({ t: 'caps', screen: true });
    await settle();
    expect(fresh.screenTracks).toEqual([{ video: share.video, audio: share.audio }]);
    expect(w.b.controller.getSnapshot().screenSharing).toBe(true);

    fresh.options.onControl({ t: 'caps', screen: true });
    await settle();
    expect(fresh.screenTracks).toHaveLength(1);
  });

  it('does not leave the screen on the new connection when the share is stopped during the reattach', async () => {
    const { w } = await sharingTransfer();
    const fresh = w.b.peers[1]!;
    let release: () => void = () => undefined;
    fresh.setMovieMode = () => new Promise<void>((resolve) => {
      release = resolve;
    });

    fresh.options.onControl({ t: 'caps', screen: true });
    await settle();
    await w.b.controller.toggleScreenShare();
    release();
    await settle();

    expect(w.b.controller.getSnapshot().screenSharing).toBe(false);
    expect(fresh.screenTracks.some((entry) => entry.video !== null)).toBe(false);
  });

  it('stops the share with a notice when the new device cannot receive screens', async () => {
    const { w, share } = await sharingTransfer();
    const fresh = w.b.peers[1]!;
    fresh.shareable = false;

    fresh.options.onControl({ t: 'caps', screen: false });
    await settle();
    expect(w.b.controller.getSnapshot()).toMatchObject({ screenSharing: false, notice: { kind: 'screen-failed' } });
    expect(share.video.stopped).toBe(true);
  });

  it('shows the camera of the device that took over once it announces it', async () => {
    const { w } = await sharingTransfer();
    expect(w.b.controller.getSnapshot().remoteCameraOn).toBe(false);
    w.b.peers[1]!.options.onControl({ t: 'camera', on: true });
    expect(w.b.controller.getSnapshot().remoteCameraOn).toBe(true);
  });

  it('rejects a transfer that is not signed by the pinned peer key', async () => {
    const { w, callId } = await transferWorld();
    const mallory = await makeParty('alice');
    const fake = makeNode(mallory, () => Promise.resolve({ peer: w.bob.pinned }));
    fake.socket.receive('call:config', { enabled: true, relayAvailable: false });
    fake.socket.receive('call:state', { callId, state: 'active', roomId: 'room-1', kind: 'voice', peerId: 'bob', role: 'caller', answeredAt: null });
    await settle();
    await fake.controller.transferHere();
    await settle();
    const envelope = fake.socket.sent('call:transfer')[0]!.envelope as string;

    w.b.socket.receive('call:peer-transfer', { callId, from: 'alice', envelope });
    await settle();
    expect(w.b.peers).toHaveLength(1);
    expect(w.b.peers[0]!.closed).toBe(false);
    expect(w.b.socket.sent('call:transfer-accept')).toHaveLength(0);
  });

  it('ignores an accept that fails validation instead of failing the call', async () => {
    const { w, a2, callId } = await transferWorld();
    await a2.controller.transferHere();
    await settle();
    const other = makeNode(w.alice, () => Promise.resolve({ peer: w.bob.pinned }));
    other.socket.receive('call:config', { enabled: true, relayAvailable: false });
    other.socket.receive('call:state', { callId, state: 'active', roomId: 'room-1', kind: 'voice', peerId: 'bob', role: 'caller', answeredAt: null });
    await settle();
    await other.controller.transferHere();
    await settle();
    w.b.socket.receive('call:peer-transfer', { callId, from: 'alice', envelope: other.socket.sent('call:transfer')[0]!.envelope });
    await settle();
    const wrongDevice = w.b.socket.sent('call:transfer-accept')[0]!.envelope;

    a2.socket.receive('call:transfer-accepted', { callId, envelope: wrongDevice });
    a2.socket.receive('call:transfer-accepted', { callId, envelope: 'garbage' });
    await settle();
    expect(a2.peers).toHaveLength(0);
    expect(a2.controller.getSnapshot().state.phase).toBe('reconnecting');
    expect(a2.socket.sent('call:hangup')).toHaveLength(0);
    expect(a2.socket.sent('call:heartbeat')).toHaveLength(0);
  });

  it('serializes racing transfers on the peer so each one is answered in order', async () => {
    const { w, a2, callId } = await transferWorld();
    const a3 = makeNode(w.alice, () => Promise.resolve({ peer: w.bob.pinned }));
    a3.socket.receive('call:config', { enabled: true, relayAvailable: false });
    a3.socket.receive('call:state', { callId, state: 'active', roomId: 'room-1', kind: 'voice', peerId: 'bob', role: 'caller', answeredAt: null });
    await settle();
    await a2.controller.transferHere();
    await a3.controller.transferHere();
    await settle();

    w.b.socket.receive('call:peer-transfer', { callId, from: 'alice', envelope: a2.socket.sent('call:transfer')[0]!.envelope });
    w.b.socket.receive('call:peer-transfer', { callId, from: 'alice', envelope: a3.socket.sent('call:transfer')[0]!.envelope });
    await settle();

    expect(w.b.socket.sent('call:transfer-accept')).toHaveLength(2);
    expect(w.b.peers).toHaveLength(3);
    expect(w.b.peers.slice(0, 2).every((peer) => peer.closed)).toBe(true);
    expect(w.b.peers[2]!.closed).toBe(false);
    expect(w.b.controller.getSnapshot().state.phase).toBe('reconnecting');
  });

  it('gives up quietly when the server drops an unanswered transfer and shows a notice', async () => {
    const { a2, callId } = await transferWorld();
    await a2.controller.transferHere();
    await settle();
    const syncs = a2.socket.sent('call:sync').length;
    a2.socket.receive('call:transfer-failed', { callId });
    await settle();
    expect(a2.controller.getSnapshot()).toMatchObject({ state: { phase: 'idle' }, notice: { kind: 'transfer-failed' }, localStream: null });
    expect(a2.stopped).toBeGreaterThan(0);
    expect(a2.socket.sent('call:hangup')).toHaveLength(0);
    expect(a2.socket.sent('call:sync').length).toBe(syncs + 1);
  });

  it('takes over the microphone and camera state the old device reported, even in a voice call', async () => {
    const { w, callId } = await transferWorld();
    const kinds: string[] = [];
    const audio = { kind: 'audio', enabled: true, stop: () => undefined };
    const camera = { kind: 'video', enabled: true, stop: () => undefined };
    const a2 = makeNode(w.alice, () => Promise.resolve({ peer: w.bob.pinned }), {
      acquireMedia: (kind) => {
        kinds.push(kind);
        const video = kind === 'video' ? [camera] : [];
        return Promise.resolve({ stream: { getTracks: () => [audio, ...video], getAudioTracks: () => [audio], getVideoTracks: () => video } as unknown as MediaStream, cameraFailed: false });
      },
    });
    a2.socket.receive('call:config', { enabled: true, relayAvailable: false });
    a2.socket.receive('call:state', { callId, state: 'active', roomId: 'room-1', kind: 'voice', peerId: 'bob', role: 'caller', answeredAt: null, transferable: true, media: { muted: true, camera: true } });
    await settle();
    expect(a2.controller.getSnapshot().otherDevice?.media).toEqual({ muted: true, camera: true });

    await a2.controller.transferHere();
    await settle();

    expect(kinds).toEqual(['video']);
    expect(a2.controller.getSnapshot()).toMatchObject({ muted: true, cameraOn: true });
    expect(audio.enabled).toBe(false);
  });

  it('leaves the camera off on the new device when the old one had it off in a video call', async () => {
    const { w, callId } = await transferWorld();
    const kinds: string[] = [];
    const a2 = makeNode(w.alice, () => Promise.resolve({ peer: w.bob.pinned }), {
      acquireMedia: (kind) => {
        kinds.push(kind);
        return Promise.resolve({ stream: { getTracks: () => [], getAudioTracks: () => [], getVideoTracks: () => (kind === 'video' ? [{}] : []) } as unknown as MediaStream, cameraFailed: false });
      },
    });
    a2.socket.receive('call:config', { enabled: true, relayAvailable: false });
    a2.socket.receive('call:state', { callId, state: 'active', roomId: 'room-1', kind: 'video', peerId: 'bob', role: 'caller', answeredAt: null, media: { muted: false, camera: false } });
    await settle();
    await a2.controller.transferHere();
    await settle();
    expect(kinds).toEqual(['voice']);
    expect(a2.controller.getSnapshot()).toMatchObject({ muted: false, cameraOn: false });
  });

  it('falls back to the call kind when the server does not report the old device state', async () => {
    const { w, callId } = await transferWorld();
    const kinds: string[] = [];
    const a2 = makeNode(w.alice, () => Promise.resolve({ peer: w.bob.pinned }), {
      acquireMedia: (kind) => {
        kinds.push(kind);
        return Promise.resolve({ stream: { getTracks: () => [], getAudioTracks: () => [], getVideoTracks: () => (kind === 'video' ? [{}] : []) } as unknown as MediaStream, cameraFailed: false });
      },
    });
    a2.socket.receive('call:config', { enabled: true, relayAvailable: false });
    a2.socket.receive('call:state', { callId, state: 'active', roomId: 'room-1', kind: 'video', peerId: 'bob', role: 'caller', answeredAt: null });
    await settle();
    await a2.controller.transferHere();
    await settle();
    expect(kinds).toEqual(['video']);
  });

  it('reports its microphone and camera state with every heartbeat and right after a change', async () => {
    const { w, callId } = await transferWorld();
    w.a.socket.connected = true;
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
    expect(w.a.socket.sent('call:heartbeat').at(-1)).toMatchObject({ callId, media: { muted: false, camera: false } });
    const before = w.a.socket.sent('call:heartbeat').length;
    w.a.controller.toggleMute();
    await settle();
    expect(w.a.socket.sent('call:heartbeat')).toHaveLength(before + 1);
    expect(w.a.socket.sent('call:heartbeat').at(-1)).toMatchObject({ callId, media: { muted: true, camera: false } });
  });

  it('asks for the call state after moving away so the call can be taken back from this device', async () => {
    const { w, callId } = await transferWorld();
    const syncs = w.a.socket.sent('call:sync').length;
    w.a.socket.receive('call:transferred', { callId });
    await settle();
    expect(w.a.socket.sent('call:sync').length).toBeGreaterThan(syncs);
    w.a.socket.receive('call:state', { callId, state: 'active', roomId: 'room-1', kind: 'voice', peerId: 'bob', role: 'caller', answeredAt: null, transferable: true });
    await settle();
    expect(w.a.controller.getSnapshot().otherDevice).toMatchObject({ callId });
  });

  it('tears the old device down quietly without hanging up and tells the user', async () => {
    const { w, callId } = await transferWorld();
    const stoppedBefore = w.a.stopped;
    w.a.socket.receive('call:transferred', { callId });
    await settle();
    expect(w.a.peers[0]!.closed).toBe(true);
    expect(w.a.stopped).toBeGreaterThan(stoppedBefore);
    expect(w.a.socket.sent('call:hangup')).toHaveLength(0);
    expect(w.a.controller.getSnapshot()).toMatchObject({ state: { phase: 'idle' }, notice: { kind: 'transferred' }, localStream: null, remoteStream: null });
    expect(w.b.controller.getSnapshot().state.phase).toBe('active');
  });
});

describe('transfer refused by the server', () => {
  it('returns the losing device to the passive state when its transfer is refused', async () => {
    const w = await world();
    await connectCall(w);
    w.a.peers[0]!.options.onConnection('connected');
    const callId = w.a.controller.getSnapshot().state.callId!;
    const a2 = makeNode(w.alice, () => Promise.resolve({ peer: w.bob.pinned }));
    a2.socket.receive('call:config', { enabled: true, relayAvailable: false });
    a2.socket.receive('call:state', { callId, state: 'active', roomId: 'room-1', kind: 'voice', peerId: 'bob', role: 'caller', answeredAt: null });
    await settle();
    await a2.controller.transferHere();
    await settle();

    a2.socket.receive('error', { message: 'x', code: 'call.invalidState', event: 'call:transfer', params: { callId } });
    await settle();

    expect(a2.controller.getSnapshot()).toMatchObject({ state: { phase: 'idle' }, notice: { kind: 'transfer-failed' } });
    expect(a2.socket.sent('call:hangup')).toHaveLength(0);
  });
});

describe('push notification actions', () => {
  async function heldRing() {
    const w = await world();
    const route = w.a.socket.onEmit;
    let start: Record<string, unknown> | null = null;
    w.a.socket.onEmit = (event, payload) => {
      if (event === 'call:start') {
        start = payload;
        return;
      }
      route?.(event, payload);
    };
    void w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind: 'voice' });
    await settle();
    const payload = start as unknown as Record<string, unknown>;
    w.a.socket.onEmit = route;
    return { w, callId: payload.callId as string, deliver: () => route?.('call:start', payload) };
  }

  it('answers a call from the notification when the invite arrives after the app opened', async () => {
    const { w, callId, deliver } = await heldRing();

    w.b.controller.handleNotificationAction({ type: 'answer', callId });
    await settle();
    expect(w.b.socket.sent('call:sync').length).toBeGreaterThan(0);
    deliver();
    await settle();

    expect(w.b.socket.sent('call:accept')).toEqual([expect.objectContaining({ callId })]);
    expect(w.b.controller.getSnapshot().state.phase).toBe('connecting');
  });

  it('answers right away when the call is already ringing and ignores an answer for another call', async () => {
    const { w, callId, deliver } = await heldRing();
    deliver();
    await settle();

    w.b.controller.handleNotificationAction({ type: 'answer', callId: 'other-call' });
    await settle();
    expect(w.b.controller.getSnapshot().state.phase).toBe('incoming-ringing');

    w.b.controller.handleNotificationAction({ type: 'answer', callId });
    await settle();
    expect(w.b.socket.sent('call:accept')).toHaveLength(1);
  });

  it('forgets a pending answer after a minute so a later ring is not answered by itself', async () => {
    const { w, callId, deliver } = await heldRing();
    w.b.controller.handleNotificationAction({ type: 'answer', callId });
    w.b.deps.now = () => Date.now() + 61_000;
    deliver();
    await settle();

    expect(w.b.socket.sent('call:accept')).toHaveLength(0);
    expect(w.b.controller.getSnapshot().state.phase).toBe('incoming-ringing');
  });

  it('declines on the server when the notification is declined and never rings for that call', async () => {
    const { w, callId, deliver } = await heldRing();

    w.b.controller.handleNotificationAction({ type: 'decline', callId });
    deliver();
    await settle();

    expect(w.b.socket.sent('call:decline')).toEqual([{ callId }]);
    expect(w.b.controller.getSnapshot().state.phase).not.toBe('incoming-ringing');
    expect(w.b.rings).not.toContain('incoming');
  });

  it('applies an answer or a decline that arrives while the invite is still being opened', async () => {
    const answered = await heldRing();
    answered.deliver();
    answered.w.b.controller.handleNotificationAction({ type: 'answer', callId: answered.callId });
    await settle();
    expect(answered.w.b.socket.sent('call:accept')).toEqual([expect.objectContaining({ callId: answered.callId })]);

    const declined = await heldRing();
    declined.deliver();
    declined.w.b.controller.handleNotificationAction({ type: 'decline', callId: declined.callId });
    await settle();
    expect(declined.w.b.controller.getSnapshot().state).toMatchObject({ phase: 'ended', reason: 'declined' });
  });

  it('declines a call that is already ringing like the decline button', async () => {
    const { w, callId, deliver } = await heldRing();
    deliver();
    await settle();

    w.b.controller.handleNotificationAction({ type: 'decline', callId });
    await settle();

    expect(w.b.socket.sent('call:decline')).toEqual([{ callId }]);
    expect(w.b.controller.getSnapshot().state).toMatchObject({ phase: 'ended', reason: 'declined' });
  });
});

describe('same tab recovery and glare', () => {
  it('sends the tab token with sync, start, accept and heartbeats', async () => {
    const w = await world({ alice: { tabDevice: () => 'tab-alice-0123456789' }, bob: { tabDevice: () => 'tab-bobby-0123456789' } });
    w.a.socket.receive('connect', undefined);
    expect(w.a.socket.sent('call:sync').at(-1)).toMatchObject({ device: 'tab-alice-0123456789' });

    await connectCall(w);
    expect(w.a.socket.sent('call:start')[0]).toMatchObject({ device: 'tab-alice-0123456789' });
    expect(w.b.socket.sent('call:accept')[0]).toMatchObject({ device: 'tab-bobby-0123456789' });
    w.a.socket.connected = true;
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
    expect(w.a.socket.sent('call:heartbeat').at(-1)).toMatchObject({ device: 'tab-alice-0123456789' });
  });

  it('resumes the call by itself after a reload when the server says this tab owned it', async () => {
    const w = await world();
    w.a.socket.receive('call:state', { callId: 'mineAAAAAAAAAAAAAAAAAA', state: 'active', roomId: 'room-1', kind: 'video', peerId: 'bob', role: 'caller', transferable: true, resumable: true, answeredAt: null, media: { muted: true, camera: false } });
    await settle();

    expect(w.a.socket.sent('call:transfer')).toEqual([expect.objectContaining({ callId: 'mineAAAAAAAAAAAAAAAAAA' })]);
    expect(w.a.controller.getSnapshot()).toMatchObject({ otherDevice: null, muted: true });
    expect(w.a.controller.getSnapshot().state.phase).toBe('reconnecting');
  });

  it('still only offers the switch for a call of another tab or device', async () => {
    const w = await world();
    w.a.socket.receive('call:state', { callId: 'elsewhere', state: 'active', roomId: 'room-1', kind: 'voice', peerId: 'bob', role: 'caller', transferable: true });
    await settle();

    expect(w.a.socket.sent('call:transfer')).toEqual([]);
    expect(w.a.controller.getSnapshot().otherDevice).toMatchObject({ callId: 'elsewhere' });
  });

  it('connects one call when both sides call each other at the same time', async () => {
    const w = await world();
    const aRoute = w.a.socket.onEmit;
    const bRoute = w.b.socket.onEmit;
    let aStart: Record<string, unknown> | null = null;
    w.a.socket.onEmit = (event, payload) => {
      if (event === 'call:start') {
        aStart = payload;
      }
      aRoute?.(event, payload);
    };
    w.b.socket.onEmit = (event, payload) => {
      if (event === 'call:start') {
        w.b.socket.receive('error', { event: 'call:start', code: 'call.alreadyInCall', message: 'x', params: { callId: payload.callId } });
        return;
      }
      if (event === 'call:sync' && aStart) {
        w.b.socket.receive('call:incoming', { callId: aStart.callId, roomId: aStart.roomId, kind: aStart.kind, callerId: 'alice', envelope: aStart.envelope, ringExpiresAt: 1 });
        return;
      }
      bRoute?.(event, payload);
    };

    void w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind: 'voice' });
    void w.b.controller.startCall({ roomId: 'room-1', peerId: 'alice', kind: 'voice' });
    await settle();
    await settle();

    expect(w.b.controller.getSnapshot().notice).toBeNull();
    expect(w.b.socket.sent('call:accept')).toEqual([expect.objectContaining({ callId: (aStart as unknown as Record<string, unknown>).callId })]);
    expect(w.a.controller.getSnapshot().state.phase).toBe('connecting');
    expect(w.b.controller.getSnapshot().state.phase).toBe('connecting');
  });

  it('answers the ringing call when calling back the same person a moment later', async () => {
    const w = await world();
    void w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind: 'voice' });
    await settle();
    expect(w.b.controller.getSnapshot().state.phase).toBe('incoming-ringing');
    const incomingId = w.b.controller.getSnapshot().state.callId;

    void w.b.controller.startCall({ roomId: 'room-1', peerId: 'alice', kind: 'voice' });
    await settle();

    expect(w.b.socket.sent('call:start')).toEqual([]);
    expect(w.b.socket.sent('call:accept')).toEqual([expect.objectContaining({ callId: incomingId })]);
    expect(w.b.controller.getSnapshot().state.phase).toBe('connecting');
  });

  it('answers the call when calling back the same person while their invite is still being opened', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let w: World | null = null;
    w = await world({
      bobResolve: async () => {
        await gate;
        return { peer: (w as World).alice.pinned };
      },
    });
    void w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind: 'voice' });
    await settle();
    expect(w.b.controller.getSnapshot().state.phase).toBe('idle');

    void w.b.controller.startCall({ roomId: 'room-1', peerId: 'alice', kind: 'voice' });
    await settle();
    release();
    await settle();
    await settle();

    expect(w.b.socket.sent('call:start')).toEqual([]);
    expect(w.b.socket.sent('call:accept')).toHaveLength(1);
    expect(w.b.controller.getSnapshot().state.phase).toBe('connecting');
    expect(w.a.controller.getSnapshot().state.phase).toBe('connecting');
  });

  it('does not keep auto answering after calling back during an invite that then fails to open', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    let w: World | null = null;
    w = await world({
      bobResolve: async () => {
        calls += 1;
        if (calls === 1) {
          await gate;
          return { error: 'unverifiable' };
        }
        return { peer: (w as World).alice.pinned };
      },
    });
    void w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind: 'voice' });
    await settle();
    void w.b.controller.startCall({ roomId: 'room-1', peerId: 'alice', kind: 'voice' });
    await settle();
    release();
    await settle();
    expect(w.b.socket.sent('call:accept')).toEqual([]);
    w.a.controller.hangup();
    await settle();
    w.a.controller.dismissEnded();
    await vi.advanceTimersByTimeAsync(1_000);

    void w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind: 'voice' });
    await settle();
    expect(w.b.controller.getSnapshot().state.phase).toBe('incoming-ringing');
    expect(w.b.socket.sent('call:accept')).toEqual([]);
  });

  it('keeps the invite of the person it is calling when it arrives while the private room is still loading', async () => {
    let roomReady = false;
    const w = await world({ bob: { isPrivateRoomWith: () => roomReady } });
    const bRoute = w.b.socket.onEmit;
    let aStart: Record<string, unknown> | null = null;
    const aRoute = w.a.socket.onEmit;
    w.a.socket.onEmit = (event, payload) => {
      if (event === 'call:start') {
        aStart = payload;
      }
      aRoute?.(event, payload);
    };
    let bStarts = 0;
    w.b.socket.onEmit = (event, payload) => {
      if (event === 'call:start') {
        bStarts += 1;
        w.b.socket.receive('error', { event: 'call:start', code: 'call.peerBusy', message: 'x', params: { callId: payload.callId } });
        return;
      }
      bRoute?.(event, payload);
    };

    void w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind: 'voice' });
    await settle();
    expect(aStart).not.toBeNull();
    roomReady = true;
    void w.b.controller.startCall({ roomId: 'room-1', peerId: 'alice', kind: 'voice' });
    await vi.advanceTimersByTimeAsync(2_000);
    await settle();

    expect(bStarts).toBe(1);
    expect(w.b.controller.getSnapshot().notice).toBeNull();
    expect(w.b.socket.sent('call:accept')).toEqual([expect.objectContaining({ callId: (aStart as unknown as Record<string, unknown>).callId })]);
    expect(w.b.controller.getSnapshot().state.phase).toBe('connecting');
  });

  it('keeps ignoring a call to someone else while another person is ringing', async () => {
    const w = await world();
    void w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind: 'voice' });
    await settle();

    void w.b.controller.startCall({ roomId: 'room-2', peerId: 'carol', kind: 'voice' });
    await settle();

    expect(w.b.socket.sent('call:start')).toEqual([]);
    expect(w.b.socket.sent('call:accept')).toEqual([]);
    expect(w.b.controller.getSnapshot().state.phase).toBe('incoming-ringing');
  });

  it('does not auto answer a later call from someone who was simply busy', async () => {
    const w = await world();
    w.b.socket.onEmit = (event, payload) => {
      if (event === 'call:start') {
        w.b.socket.receive('error', { event: 'call:start', code: 'call.peerBusy', message: 'x', params: { callId: payload.callId } });
      }
    };
    void w.b.controller.startCall({ roomId: 'room-1', peerId: 'alice', kind: 'voice' });
    await settle();
    expect(w.b.controller.getSnapshot().state).toMatchObject({ phase: 'ended', reason: 'busy' });
    w.b.controller.dismissEnded();

    await vi.advanceTimersByTimeAsync(30_000);
    void w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind: 'voice' });
    await settle();
    expect(w.b.socket.sent('call:accept')).toEqual([]);
  });
});
