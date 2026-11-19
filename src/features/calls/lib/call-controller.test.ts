import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PinnedPeer, SignalType } from '@lib/e2ee/call-crypto';
import type { CurrentIdentity } from '@lib/e2ee/current-identity';
import { generateIdentity } from '@lib/e2ee/identity';
import { buildSigningProof } from '@lib/e2ee/signing';
import {
  CallController,
  FALLBACK_STUN,
  HEARTBEAT_INTERVAL_MS,
  type CallControllerDeps,
  type CallSocket,
  type PeerSessionFactoryOptions,
  type PeerSessionLike,
  type ResolvedPeer,
} from './call-controller';
import { createTabOwnership } from './tab-ownership';

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
  applyDegrade(): Promise<void> {
    return Promise.resolve();
  }
  getStats(): Promise<RTCStatsReport> {
    return Promise.resolve(new Map() as unknown as RTCStatsReport);
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
    stopMedia: () => {
      node.stopped += 1;
    },
    createPeerSession: (options) => {
      const peer = new FakePeer(options);
      node.peers.push(peer);
      return peer;
    },
    getProtectIp: () => false,
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
    expect(node.controller.getSnapshot()).toMatchObject({ enabled: true, relayAvailable: false });
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
    expect(node.controller.getSnapshot()).toMatchObject({ enabled: true, relayAvailable: true });

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

  it('refuses protect-my-IP calls when relay is unavailable instead of exposing the IP', async () => {
    const w = await world({ alice: { getProtectIp: () => true } });
    w.a.socket.receive('call:config', { enabled: true, relayAvailable: false });

    await w.a.controller.startCall({ roomId: 'room-1', peerId: 'bob', kind: 'voice' });

    expect(w.a.controller.getSnapshot().notice).toEqual({ kind: 'relay-unavailable' });
    expect(w.a.socket.sent('call:start')).toHaveLength(0);
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
  });

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

  it('fails the call when relay is required but the server says it is unavailable', async () => {
    const w = await world({ alice: { getProtectIp: () => true } });
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

    expect(w.a.controller.getSnapshot().state).toMatchObject({ phase: 'ended', reason: 'failed', detail: 'relay-unavailable' });
    expect(w.a.controller.getSnapshot().notice).toMatchObject({ kind: 'relay-unavailable' });
    expect(w.a.peers).toHaveLength(0);
  });

  it('ends a live call locally when the server reports no active call after reconnecting', async () => {
    const w = await world();
    await connectCall(w);
    w.a.peers[0]!.options.onConnection('connected');

    w.a.socket.receive('call:state', null);

    expect(w.a.controller.getSnapshot().state).toMatchObject({ phase: 'ended', reason: 'connection-lost' });
  });

  it('restarts ICE when the server confirms the same call after a reconnect', async () => {
    const w = await world();
    await connectCall(w);
    const callId = w.a.controller.getSnapshot().state.callId;

    w.a.socket.receive('call:state', { callId, state: 'active', roomId: 'room-1', kind: 'voice', peerId: 'bob', role: 'caller' });
    await settle();

    expect(w.a.peers[0]!.restarts).toBe(1);
  });

  it('hangs up an orphaned server call after a reload, but not when another tab owns it', async () => {
    const w = await world();
    w.a.socket.receive('call:state', { callId: 'orphan', state: 'active', roomId: 'room-1', kind: 'voice', peerId: 'bob', role: 'caller' });
    await settle();
    expect(w.a.socket.sent('call:hangup')).toEqual([{ callId: 'orphan' }]);

    const tabs = createTabOwnership({ locks: null, createChannel: () => null, tabId: 'y' });
    const busy = await world({ alice: { tabs: { ...tabs, isCallHeldByOtherTab: () => Promise.resolve(true) } } });
    busy.a.socket.receive('call:state', { callId: 'orphan', state: 'active', roomId: 'room-1', kind: 'voice', peerId: 'bob', role: 'caller' });
    await settle();
    expect(busy.a.socket.sent('call:hangup')).toHaveLength(0);
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

  it('ends the losing callee locally when answered elsewhere while connecting', async () => {
    const w = await world();
    await connectCall(w);

    w.b.socket.receive('call:answered-elsewhere', { callId: w.b.controller.getSnapshot().state.callId });

    expect(w.b.controller.getSnapshot().state.phase).toBe('ended');
    expect(w.b.socket.sent('call:hangup')).toHaveLength(0);
    expect(w.b.peers[0]!.closed).toBe(true);
  });

  it('removes its socket listeners when disposed', async () => {
    const w = await world();
    const before = Array.from(w.a.socket.handlers.values()).reduce((sum, set) => sum + set.size, 0);
    expect(before).toBeGreaterThan(0);

    w.a.controller.dispose();

    expect(Array.from(w.a.socket.handlers.values()).reduce((sum, set) => sum + set.size, 0)).toBe(0);
  });
});
