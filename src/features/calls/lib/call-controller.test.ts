import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CallCryptoModule from '@lib/e2ee/call-crypto';
import type { PinnedPeer, SignalType } from '@lib/e2ee/call-crypto';
import type { CurrentIdentity } from '@lib/e2ee/current-identity';
import { generateIdentity } from '@lib/e2ee/identity';
import { buildSigningProof } from '@lib/e2ee/signing';
import {
  CallController,
  FALLBACK_STUN,
  HEARTBEAT_INTERVAL_MS,
  sanitizeEndReason,
  type CallControllerDeps,
  type CallSocket,
  type PeerSessionFactoryOptions,
  type PeerSessionLike,
  type ResolvedPeer,
} from './call-controller';
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
  statsReport: Map<string, Record<string, unknown>> = new Map();
  getStats(): Promise<RTCStatsReport> {
    return Promise.resolve(this.statsReport as unknown as RTCStatsReport);
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
    expect(w.a.controller.getSnapshot().otherDevice).toEqual({ callId: 'elsewhere', peerId: 'bob', kind: 'voice', roomId: 'room-1', role: 'caller', answeredAt: null });
    expect(w.a.controller.getSnapshot().notice).toBeNull();

    w.a.socket.receive('call:ended', { callId: 'elsewhere', reason: 'completed', endedAt: 1 });
    expect(w.a.controller.getSnapshot().otherDevice).toBeNull();
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

  it('fails the call after three ice retries on call.invalidState', async () => {
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
    for (const delay of [300, 600, 1200]) {
      await vi.advanceTimersByTimeAsync(delay);
      await settle();
    }

    expect(w.b.socket.sent('call:ice-servers')).toHaveLength(4);
    expect(w.b.controller.getSnapshot().state).toMatchObject({ phase: 'ended', reason: 'failed', detail: 'call.invalidState' });
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
  const listeners: Array<() => void> = [];
  const video = {
    kind: 'video',
    stopped: false,
    stop() {
      this.stopped = true;
    },
    addEventListener: (_event: string, listener: () => void) => listeners.push(listener),
  };
  const audio = { kind: 'audio', stopped: false, stop() { this.stopped = true; } };
  const tracks = withAudio ? [video, audio] : [video];
  const stream = {
    getTracks: () => tracks,
    getVideoTracks: () => [video],
    getAudioTracks: () => (withAudio ? [audio] : []),
  } as unknown as MediaStream;
  return { stream, video, audio, end: () => listeners.forEach((listener) => listener()) };
}

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

describe('voice leveling', () => {
  interface FakeLeveler extends VoiceLeveler {
    inputs: unknown[];
    volumes: number[];
    mutes: boolean[];
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
      closed: 0,
      sendStream: () => sendStream,
      setInput: (track) => {
        leveler.inputs.push(track);
        return output;
      },
      setVolume: (volume) => void leveler.volumes.push(volume),
      setMuted: (muted) => void leveler.mutes.push(muted),
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
