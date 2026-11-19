import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallRole, SignalType } from '@lib/e2ee/call-crypto';
import {
  AUDIO_MAX_BITRATE,
  CONNECT_RESTART_DELAY_MS,
  CONTROL_CHANNEL_ID,
  CONTROL_CHANNEL_LABEL,
  CREDENTIAL_REFRESH_MS,
  DISCONNECTED_RESTART_DELAY_MS,
  DTLS_VERIFY_TIMEOUT_MS,
  MAX_REMOTE_CANDIDATES,
  PeerSession,
  VIDEO_DEGRADED_MAX_BITRATE,
  VIDEO_MAX_BITRATE,
  extractSdpFingerprints,
  parseControlMessage,
  type ControlMessage,
  type DegradeStep,
  type PeerSessionOptions,
} from './peer-session';

const LOCAL_FP = 'AA:AA:AA';
const REMOTE_FP = 'BB:BB:BB';
const HOST = 'candidate:1 1 udp 2122260223 192.168.1.5 5000 typ host';
const RELAY = 'candidate:2 1 udp 41885439 203.0.113.9 6000 typ relay raddr 0.0.0.0 rport 0';

class FakeSender {
  track: { kind: string } | null;
  parameters: { encodings: Array<Record<string, unknown>> } = { encodings: [] };
  constructor(track: { kind: string } | null) {
    this.track = track;
  }
  failReplaces = 0;
  replaceTrack(track: { kind: string } | null): Promise<void> {
    if (this.failReplaces > 0) {
      this.failReplaces -= 1;
      return Promise.reject(new Error('replace failed'));
    }
    this.track = track;
    return Promise.resolve();
  }
  getParameters() {
    return structuredClone(this.parameters);
  }
  setParameters(parameters: { encodings: Array<Record<string, unknown>> }): Promise<void> {
    this.parameters = structuredClone(parameters);
    return Promise.resolve();
  }
}

class FakeTransceiver {
  readonly sender: FakeSender;
  readonly receiver: { track: { kind: string } };
  direction = 'sendrecv';
  constructor(kind: string, track: { kind: string } | null) {
    this.sender = new FakeSender(track);
    this.receiver = { track: { kind } };
  }
}

class FakeChannel {
  readyState = 'open';
  sent: string[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor(
    readonly label: string,
    readonly init: unknown,
  ) {}
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 'closed';
  }
}

class FakeConnection {
  signalingState = 'stable';
  iceConnectionState = 'new';
  connectionState = 'new';
  localDescription: { type: string; sdp: string } | null = null;
  remoteDescription: { type: string; sdp: string } | null = null;
  transceivers: FakeTransceiver[] = [];
  channels: FakeChannel[] = [];
  added: Array<Record<string, unknown>> = [];
  restartCalls = 0;
  closed = false;
  negotiationPending = false;
  remoteCertificates: ArrayBuffer[] = [new ArrayBuffer(8)];
  configuration: Record<string, unknown>;
  onicecandidate: ((event: { candidate: unknown }) => void) | null = null;
  onnegotiationneeded: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  ontrack: ((event: unknown) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;

  constructor(config: Record<string, unknown>) {
    this.configuration = { ...config };
  }

  createDataChannel(label: string, init: unknown): FakeChannel {
    const channel = new FakeChannel(label, init);
    this.channels.push(channel);
    return channel;
  }

  addTransceiver(source: string | { kind: string }): FakeTransceiver {
    const kind = typeof source === 'string' ? source : source.kind;
    const transceiver = new FakeTransceiver(kind, typeof source === 'string' ? null : source);
    this.transceivers.push(transceiver);
    if (!this.negotiationPending) {
      this.negotiationPending = true;
      queueMicrotask(() => {
        this.negotiationPending = false;
        this.onnegotiationneeded?.();
      });
    }
    return transceiver;
  }

  addTrack(track: { kind: string }): FakeSender {
    const free = this.transceivers.find((transceiver) => transceiver.receiver.track.kind === track.kind && !transceiver.sender.track);
    if (free) {
      free.sender.track = track;
      return free.sender;
    }
    const transceiver = new FakeTransceiver(track.kind, track);
    this.transceivers.push(transceiver);
    return transceiver.sender;
  }

  getTransceivers(): FakeTransceiver[] {
    return this.transceivers;
  }

  transport = {
    state: 'new',
    onstatechange: null as (() => void) | null,
    getRemoteCertificates: (): ArrayBuffer[] => this.remoteCertificates,
  };

  hasTransport = true;

  getReceivers() {
    return this.hasTransport ? [{ transport: this.transport }] : [];
  }

  setDtls(state: string): void {
    this.transport.state = state;
    this.transport.onstatechange?.();
  }

  setLocalDescription(): Promise<void> {
    const type = this.signalingState === 'have-remote-offer' ? 'answer' : 'offer';
    this.localDescription = { type, sdp: `v=0\r\na=fingerprint:sha-256 ${LOCAL_FP}\r\n` };
    this.signalingState = type === 'offer' ? 'have-local-offer' : 'stable';
    return Promise.resolve();
  }

  setRemoteDescription(description: { type: string; sdp: string }): Promise<void> {
    this.remoteDescription = description;
    this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
    return Promise.resolve();
  }

  addIceCandidate(candidate: Record<string, unknown>): Promise<void> {
    this.added.push(candidate);
    return Promise.resolve();
  }

  restartIce(): void {
    this.restartCalls += 1;
  }

  setConfiguration(configuration: Record<string, unknown>): void {
    this.configuration = { ...this.configuration, ...configuration };
  }

  getConfiguration(): Record<string, unknown> {
    return this.configuration;
  }

  stats = new Map<string, Record<string, unknown>>();

  getStats(): Promise<Map<string, Record<string, unknown>>> {
    return Promise.resolve(this.stats);
  }

  close(): void {
    this.closed = true;
  }

  setIce(state: string): void {
    this.iceConnectionState = state;
    this.oniceconnectionstatechange?.();
  }
}

interface Harness {
  session: PeerSession;
  connection: FakeConnection;
  signals: Array<{ type: SignalType; payload: Record<string, unknown> }>;
  fatals: string[];
  statuses: string[];
  controls: ControlMessage[];
  degrades: Array<DegradeStep | null>;
  streams: MediaStream[];
}

const TURN_SERVERS = [{ urls: ['stun:stun.example:3478', 'turn:turn.example:3478?transport=udp'], username: 'u', credential: 'c' }];

function localStream(kinds: string[]) {
  const tracks = kinds.map((kind) => ({ kind, enabled: true }));
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((track) => track.kind === 'audio'),
    getVideoTracks: () => tracks.filter((track) => track.kind === 'video'),
  } as unknown as MediaStream;
}

function build(role: CallRole, overrides: Partial<PeerSessionOptions> = {}, hashed = REMOTE_FP): Harness {
  let connection!: FakeConnection;
  const harness = { signals: [], fatals: [], statuses: [], controls: [], degrades: [], streams: [] } as unknown as Harness;
  const session = new PeerSession({
    role,
    kind: 'video',
    mobile: false,
    iceServers: TURN_SERVERS,
    localStream: localStream(['audio', 'video']),
    sendSignal: (type, payload) => harness.signals.push({ type, payload }),
    onConnection: (status) => harness.statuses.push(status),
    onFatal: (detail) => harness.fatals.push(detail),
    onRemoteStream: (stream) => harness.streams.push(stream),
    onControl: (message) => harness.controls.push(message),
    onDegrade: (step) => harness.degrades.push(step),
    deps: {
      createConnection: (config) => {
        connection = new FakeConnection(config as unknown as Record<string, unknown>);
        return connection as unknown as RTCPeerConnection;
      },
      hashCertificate: () => Promise.resolve(hashed),
      createStream: () => ({ addTrack: () => undefined }) as unknown as MediaStream,
    },
    ...overrides,
  });
  harness.session = session;
  harness.connection = connection;
  return harness;
}

function relayed(connection: FakeConnection): void {
  connection.stats.set('pair', { type: 'candidate-pair', nominated: true, state: 'succeeded', localCandidateId: 'local' });
  connection.stats.set('local', { type: 'local-candidate', candidateType: 'relay' });
}

function remoteDescription(type: 'offer' | 'answer', fingerprint = REMOTE_FP) {
  return {
    description: { type, sdp: `v=0\r\na=fingerprint:sha-256 ${fingerprint}\r\n` },
    fingerprints: [`sha-256 ${fingerprint}`],
  };
}

function candidatePayload(candidate: string) {
  return { candidate: { candidate, sdpMid: '0', sdpMLineIndex: 0 } };
}

async function verify(h: Harness): Promise<void> {
  await h.session.receiveSignal('answer', remoteDescription('answer'));
  h.connection.setIce('connected');
  h.connection.setDtls('connected');
  await settle();
}

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('helpers', () => {
  it('extracts normalized fingerprints from an sdp', () => {
    expect(extractSdpFingerprints('a=fingerprint:SHA-256 aa:bb\r\nx\r\na=fingerprint:sha-256 aa:bb\r\n')).toEqual(['sha-256 AA:BB']);
  });

  it('parses only well formed control messages', () => {
    expect(parseControlMessage('{"t":"hangup"}')).toEqual({ t: 'hangup' });
    expect(parseControlMessage('{"t":"mute","on":true}')).toEqual({ t: 'mute', on: true });
    expect(parseControlMessage('{"t":"camera","on":false}')).toEqual({ t: 'camera', on: false });
    for (const raw of ['', 'x', '{"t":"mute"}', '{"t":"mute","on":"yes"}', '{"t":"other"}', '[]', 5, `{"t":"hangup","pad":"${'a'.repeat(300)}"}`]) {
      expect(parseControlMessage(raw)).toBeNull();
    }
  });
});

describe('caller negotiation', () => {
  it('builds a bundled, rtcp-mux connection and creates the control channel before the offer', async () => {
    const h = build('caller');
    h.session.start();
    await settle();

    expect(h.connection.configuration).toMatchObject({
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: 1,
      iceTransportPolicy: 'all',
    });
    expect(h.connection.channels).toHaveLength(1);
    expect(h.connection.channels[0]).toMatchObject({ label: CONTROL_CHANNEL_LABEL, init: { negotiated: true, id: CONTROL_CHANNEL_ID } });
    expect(h.connection.transceivers.map((transceiver) => transceiver.receiver.track.kind)).toEqual(['audio', 'video']);
    expect(h.signals).toHaveLength(1);
    expect(h.signals[0]?.type).toBe('offer');
    expect(h.signals[0]?.payload.fingerprints).toEqual([`sha-256 ${LOCAL_FP}`]);
  });

  it('does not create the connection transceivers or signals before start', () => {
    const h = build('caller');

    expect(h.connection.transceivers).toHaveLength(0);
    expect(h.signals).toHaveLength(0);
  });

  it('applies the answer, then the queued candidates in order', async () => {
    const h = build('caller');
    h.session.start();
    await settle();

    await h.session.receiveSignal('candidate', candidatePayload(HOST));
    await h.session.receiveSignal('candidate', candidatePayload(RELAY));
    expect(h.connection.added).toHaveLength(0);

    await h.session.receiveSignal('answer', remoteDescription('answer'));

    expect(h.connection.added.map((candidate) => candidate.candidate)).toEqual([HOST, RELAY]);
    await h.session.receiveSignal('candidate', candidatePayload(HOST));
    expect(h.connection.added).toHaveLength(3);
  });

  it('forwards local candidates and the end marker', () => {
    const h = build('caller');
    h.session.start();
    h.connection.onicecandidate?.({ candidate: { candidate: HOST, sdpMid: '0', sdpMLineIndex: 0, usernameFragment: 'f' } });
    h.connection.onicecandidate?.({ candidate: null });

    expect(h.signals.map((signal) => signal.type)).toEqual(['candidate', 'end-of-candidates']);
  });

  it('ignores a colliding offer because the caller is impolite', async () => {
    const h = build('caller');
    h.session.start();
    await settle();

    await h.session.receiveSignal('offer', remoteDescription('offer'));

    expect(h.connection.remoteDescription).toBeNull();
    expect(h.signals.filter((signal) => signal.type === 'answer')).toHaveLength(0);
  });

  it('rejects descriptions whose fingerprint is not in the sdp', async () => {
    const h = build('caller');
    h.session.start();
    await settle();

    await h.session.receiveSignal('answer', { ...remoteDescription('answer'), fingerprints: ['sha-256 CC:CC:CC'] });

    expect(h.fatals).toEqual(['fingerprint-mismatch']);
    expect(h.connection.remoteDescription).toBeNull();
  });

  it('rejects malformed descriptions and a wrong description type', async () => {
    const h = build('caller');
    h.session.start();
    await settle();

    await h.session.receiveSignal('answer', { description: 'nope', fingerprints: [] });
    await h.session.receiveSignal('answer', remoteDescription('offer'));

    expect(h.fatals).toEqual(['invalid-description', 'invalid-description']);
  });
});

describe('callee negotiation', () => {
  it('does nothing until the offer arrives, then answers with its tracks and control channel', async () => {
    const h = build('callee');
    h.session.start();
    await settle();
    expect(h.signals).toHaveLength(0);
    expect(h.connection.channels).toHaveLength(0);

    h.connection.transceivers.push(new FakeTransceiver('audio', null), new FakeTransceiver('video', null));
    await h.session.receiveSignal('offer', remoteDescription('offer'));

    expect(h.signals.map((signal) => signal.type)).toEqual(['answer']);
    expect(h.signals[0]?.payload.fingerprints).toEqual([`sha-256 ${LOCAL_FP}`]);
    expect(h.connection.channels).toHaveLength(1);
    expect(h.connection.transceivers.every((transceiver) => transceiver.direction === 'sendrecv')).toBe(true);
    expect(h.connection.transceivers.every((transceiver) => transceiver.sender.track === null)).toBe(true);

    h.connection.setIce('connected');
    h.connection.setDtls('connected');
    await settle();

    expect(h.connection.transceivers.every((transceiver) => transceiver.sender.track !== null)).toBe(true);
  });

  it('yields to a colliding offer (polite) by accepting it', async () => {
    const h = build('callee');
    h.session.start();
    h.connection.signalingState = 'have-local-offer';

    await h.session.receiveSignal('offer', remoteDescription('offer'));

    expect(h.connection.remoteDescription?.type).toBe('offer');
    expect(h.signals.map((signal) => signal.type)).toEqual(['answer']);
  });

  it('processes signals strictly in order', async () => {
    const h = build('callee');
    h.session.start();

    void h.session.receiveSignal('candidate', candidatePayload(RELAY));
    void h.session.receiveSignal('offer', remoteDescription('offer'));
    await settle();

    expect(h.connection.added.map((candidate) => candidate.candidate)).toEqual([RELAY]);
    expect(h.signals.map((signal) => signal.type)).toEqual(['answer']);
  });
});

describe('normal ice policy', () => {
  it('always uses the normal transport policy and forwards every candidate type in both directions', async () => {
    const h = build('caller');
    h.session.start();
    await settle();

    expect(h.connection.configuration.iceTransportPolicy).toBe('all');
    h.connection.onicecandidate?.({ candidate: { candidate: HOST, sdpMid: '0', sdpMLineIndex: 0 } });
    h.connection.onicecandidate?.({ candidate: { candidate: RELAY, sdpMid: '0', sdpMLineIndex: 0 } });
    expect(h.signals.filter((signal) => signal.type === 'candidate')).toHaveLength(2);

    await h.session.receiveSignal('answer', remoteDescription('answer'));
    await h.session.receiveSignal('candidate', candidatePayload(HOST));
    await h.session.receiveSignal('candidate', candidatePayload(RELAY));
    expect(h.connection.added.map((candidate) => candidate.candidate)).toEqual([HOST, RELAY]);
  });

  it('starts without a relay server instead of failing', () => {
    const h = build('caller', { iceServers: [{ urls: 'stun:stun.example:3478' }] });
    h.session.start();

    expect(h.fatals).toEqual([]);
    expect(h.connection.transceivers.length).toBeGreaterThan(0);
  });
});

describe('candidate hygiene', () => {
  it('drops oversized, malformed and excess remote candidates', async () => {
    const h = build('caller');
    h.session.start();
    await settle();
    await h.session.receiveSignal('answer', remoteDescription('answer'));

    await h.session.receiveSignal('candidate', candidatePayload(HOST));
    await h.session.receiveSignal('candidate', { candidate: 'x' });
    await h.session.receiveSignal('candidate', { candidate: { candidate: 'a'.repeat(3000) } });
    await h.session.receiveSignal('candidate', { candidate: { candidate: '' } });
    expect(h.connection.added).toHaveLength(1);

    for (let index = 0; index < MAX_REMOTE_CANDIDATES + 10; index += 1) {
      await h.session.receiveSignal('candidate', candidatePayload(HOST));
    }
    expect(h.connection.added.length).toBeLessThanOrEqual(MAX_REMOTE_CANDIDATES);
  });
});

describe('ice restart', () => {
  it('restarts immediately on failed and notifies the peer', async () => {
    const h = build('caller');
    h.session.start();
    await settle();

    h.connection.setIce('failed');

    expect(h.connection.restartCalls).toBe(1);
    expect(h.signals.some((signal) => signal.type === 'ice-restart')).toBe(true);
    expect(h.statuses).toEqual(['interrupted']);
  });

  it('waits 2.5 seconds on disconnected and cancels when it recovers', async () => {
    const h = build('caller');
    h.session.start();
    await settle();

    h.connection.setIce('disconnected');
    await vi.advanceTimersByTimeAsync(DISCONNECTED_RESTART_DELAY_MS - 1);
    expect(h.connection.restartCalls).toBe(0);
    h.connection.setIce('connected');
    await vi.advanceTimersByTimeAsync(DISCONNECTED_RESTART_DELAY_MS * 2);
    expect(h.connection.restartCalls).toBe(0);

    h.connection.setIce('disconnected');
    await vi.advanceTimersByTimeAsync(DISCONNECTED_RESTART_DELAY_MS);
    expect(h.connection.restartCalls).toBe(1);
  });

  it('restarts once when the connection is still not up after 20 seconds', async () => {
    const h = build('caller');
    h.session.start();
    await settle();

    await vi.advanceTimersByTimeAsync(CONNECT_RESTART_DELAY_MS);

    expect(h.connection.restartCalls).toBe(1);
  });

  it('does not restart on the connect timer once connected', async () => {
    const h = build('caller');
    h.session.start();
    await settle();
    h.connection.setIce('connected');

    await vi.advanceTimersByTimeAsync(CONNECT_RESTART_DELAY_MS * 2);

    expect(h.connection.restartCalls).toBe(0);
  });

  it('throttles repeated restart requests and honours explicit restarts', async () => {
    const h = build('caller');
    h.session.start();
    await settle();

    h.session.restartIce();
    h.session.restartIce();
    expect(h.connection.restartCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000);
    h.session.restartIce();
    expect(h.connection.restartCalls).toBe(2);
  });
});

describe('dtls fingerprint check', () => {
  async function negotiated(hashed = REMOTE_FP) {
    const h = build('caller', {}, hashed);
    h.session.start();
    await settle();
    await h.session.receiveSignal('answer', remoteDescription('answer'));
    return h;
  }

  it('defers the check when ICE connects before the remote description is applied', async () => {
    const h = build('caller');
    h.session.start();
    await settle();

    h.connection.setIce('connected');
    h.connection.setDtls('connected');
    await settle();
    expect(h.fatals).toEqual([]);

    await h.session.receiveSignal('answer', remoteDescription('answer'));
    await settle();
    expect(h.fatals).toEqual([]);
  });

  it('waits for the dtls transport to connect, then accepts a matching certificate', async () => {
    const h = await negotiated();
    h.connection.setIce('connected');
    await settle();
    expect(h.fatals).toEqual([]);

    h.connection.setDtls('connected');
    await settle();

    expect(h.fatals).toEqual([]);
    expect(h.statuses).toEqual(['connected']);
  });

  it('verifies once the answer arrives after dtls already connected', async () => {
    const h = build('caller', {}, 'DD:DD:DD');
    h.session.start();
    await settle();
    h.connection.setIce('connected');
    h.connection.setDtls('connected');
    await settle();
    expect(h.fatals).toEqual([]);

    await h.session.receiveSignal('answer', remoteDescription('answer'));
    await settle();

    expect(h.fatals).toEqual(['fingerprint-mismatch']);
  });

  it('ends the call when the certificate does not match the signaled fingerprint', async () => {
    const h = await negotiated('DD:DD:DD');
    h.connection.setIce('connected');
    h.connection.setDtls('connected');
    await settle();

    expect(h.fatals).toEqual(['fingerprint-mismatch']);
  });

  it('treats a connected dtls transport without certificates as a failure', async () => {
    const h = await negotiated();
    h.connection.remoteCertificates = [];
    h.connection.setIce('connected');
    h.connection.setDtls('connected');
    await settle();

    expect(h.fatals).toEqual(['fingerprint-mismatch']);
  });

  it('falls back to the authenticated remote description fingerprints when the browser cannot expose certificates', async () => {
    const h = await negotiated();
    (h.connection.transport as { getRemoteCertificates?: unknown }).getRemoteCertificates = undefined;
    h.connection.setIce('connected');
    h.connection.setDtls('connected');
    await settle();

    expect(h.fatals).toEqual([]);
    expect(h.statuses).toEqual(['connected']);
  });

  it('still fails closed without certificate support when the remote description does not carry the signaled fingerprint', async () => {
    const h = await negotiated();
    (h.connection.transport as { getRemoteCertificates?: unknown }).getRemoteCertificates = undefined;
    h.connection.remoteDescription = { type: 'answer', sdp: ['v=0', 'a=fingerprint:sha-256 EE:EE:EE', ''].join(String.fromCharCode(13, 10)) };
    h.connection.setIce('connected');
    h.connection.setDtls('connected');
    await settle();

    expect(h.fatals).toEqual(['fingerprint-mismatch']);
  });

  it('rejects a remote description that carries an extra fingerprint nobody authenticated', async () => {
    const h = await negotiated();
    (h.connection.transport as { getRemoteCertificates?: unknown }).getRemoteCertificates = undefined;
    h.connection.remoteDescription = { type: 'answer', sdp: ['v=0', 'a=fingerprint:sha-256 ' + REMOTE_FP, 'a=fingerprint:sha-256 EE:EE:EE', ''].join(String.fromCharCode(13, 10)) };
    h.connection.setIce('connected');
    h.connection.setDtls('connected');
    await settle();

    expect(h.fatals).toEqual(['fingerprint-mismatch']);
  });

  it('also verifies when the connection state becomes connected', async () => {
    const h = await negotiated('DD:DD:DD');
    h.connection.transport.state = 'connected';
    h.connection.connectionState = 'connected';
    h.connection.onconnectionstatechange?.();
    await settle();

    expect(h.fatals).toEqual(['fingerprint-mismatch']);
  });
});

describe('dtls fail closed', () => {
  async function negotiated(hashed = REMOTE_FP) {
    const h = build('caller', {}, hashed);
    h.session.start();
    await settle();
    await h.session.receiveSignal('answer', remoteDescription('answer'));
    return h;
  }

  it('fails when no signaled fingerprints are known once the remote description exists', async () => {
    const h = await negotiated();
    (h.session as unknown as { remoteFingerprints: string[] }).remoteFingerprints = [];

    h.connection.setIce('connected');
    await settle();

    expect(h.fatals).toEqual(['fingerprint-mismatch']);
  });

  it('fails when ICE connects and no dtls transport can be located', async () => {
    const h = await negotiated();
    h.connection.hasTransport = false;

    h.connection.setIce('connected');
    await settle();

    expect(h.fatals).toEqual(['fingerprint-mismatch']);
  });

  it('fails when the dtls transport is not verified within 10 seconds of ICE connecting', async () => {
    const h = await negotiated();
    h.connection.setIce('connected');
    await vi.advanceTimersByTimeAsync(DTLS_VERIFY_TIMEOUT_MS - 1);
    expect(h.fatals).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);

    expect(h.fatals).toEqual(['fingerprint-mismatch']);
  });

  it('clears the watchdog after a successful verification and on close', async () => {
    const h = await negotiated();
    h.connection.setIce('connected');
    h.connection.setDtls('connected');
    await settle();
    await vi.advanceTimersByTimeAsync(DTLS_VERIFY_TIMEOUT_MS * 2);
    expect(h.fatals).toEqual([]);

    const other = await negotiated();
    other.connection.setIce('connected');
    other.session.close();
    await vi.advanceTimersByTimeAsync(DTLS_VERIFY_TIMEOUT_MS * 2);
    expect(other.fatals).toEqual([]);
  });

  it('holds remote media back until the certificate is verified, then delivers it once', async () => {
    const h = await negotiated();
    const stream = { id: 'remote' } as unknown as MediaStream;

    h.connection.ontrack?.({ streams: [stream], track: {} });
    h.connection.setIce('connected');
    await settle();
    expect(h.streams).toEqual([]);

    h.connection.setDtls('connected');
    await settle();
    expect(h.streams).toEqual([stream]);

    h.connection.ontrack?.({ streams: [stream], track: {} });
    expect(h.streams).toEqual([stream, stream]);
  });

  it('never delivers remote media when verification fails', async () => {
    const h = await negotiated('DD:DD:DD');
    h.connection.ontrack?.({ streams: [{ id: 'remote' } as unknown as MediaStream], track: {} });

    h.connection.setIce('connected');
    h.connection.setDtls('connected');
    await settle();

    expect(h.fatals).toEqual(['fingerprint-mismatch']);
    expect(h.streams).toEqual([]);
  });
});

describe('privacy before verification', () => {
  it('sends no local media and reports no connection until the certificate is verified', async () => {
    const h = build('caller');
    h.session.start();
    await settle();
    await h.session.receiveSignal('answer', remoteDescription('answer'));

    h.connection.setIce('connected');
    await settle();
    expect(h.statuses).toEqual([]);
    expect(h.connection.transceivers.every((transceiver) => transceiver.sender.track === null)).toBe(true);

    h.connection.setDtls('connected');
    await settle();

    expect(h.statuses).toEqual(['connected']);
    expect(h.connection.transceivers.every((transceiver) => transceiver.sender.track !== null)).toBe(true);
  });

  it('never attaches local media when verification fails', async () => {
    const h = build('caller', {}, 'DD:DD:DD');
    h.session.start();
    await settle();
    await h.session.receiveSignal('answer', remoteDescription('answer'));
    h.connection.setIce('connected');
    h.connection.setDtls('connected');
    await settle();

    expect(h.statuses).toEqual([]);
    expect(h.connection.transceivers.every((transceiver) => transceiver.sender.track === null)).toBe(true);
  });

  it('keeps every remote stream received before verification and delivers them all', async () => {
    const h = build('caller');
    h.session.start();
    await settle();
    const first = { id: 'one' } as unknown as MediaStream;
    const second = { id: 'two' } as unknown as MediaStream;
    h.connection.ontrack?.({ streams: [first], track: {} });
    h.connection.ontrack?.({ streams: [second], track: {} });

    await verify(h);

    expect(h.streams).toEqual([first, second]);
  });
});

describe('local media attach', () => {
  it('retries a failed replaceTrack once and succeeds', async () => {
    const h = build('caller');
    h.session.start();
    await settle();
    h.connection.transceivers[0]!.sender.failReplaces = 1;

    await verify(h);

    expect(h.fatals).toEqual([]);
    expect(h.connection.transceivers[0]!.sender.track).not.toBeNull();
  });

  it('fails visibly when replaceTrack fails twice', async () => {
    const h = build('caller');
    h.session.start();
    await settle();
    h.connection.transceivers[0]!.sender.failReplaces = 2;

    await verify(h);

    expect(h.fatals).toEqual(['media-attach-failed']);
  });
});

describe('control channel', () => {
  it('delivers valid messages, ignores invalid ones and sends only when open', async () => {
    const h = build('caller');
    h.session.start();
    await settle();
    const channel = h.connection.channels[0]!;

    channel.onmessage?.({ data: '{"t":"hangup"}' });
    expect(h.controls).toEqual([]);
    await verify(h);
    channel.onmessage?.({ data: '{"t":"hangup"}' });
    channel.onmessage?.({ data: 'junk' });
    expect(h.controls).toEqual([{ t: 'hangup' }]);

    expect(h.session.sendControl({ t: 'mute', on: true })).toBe(true);
    expect(channel.sent).toEqual(['{"t":"mute","on":true}']);
    channel.readyState = 'connecting';
    expect(h.session.sendControl({ t: 'hangup' })).toBe(false);
  });

  it('sends hangup but no mute or camera state before verification', async () => {
    const h = build('caller');
    h.session.start();
    await settle();
    const channel = h.connection.channels[0]!;

    expect(h.session.sendControl({ t: 'mute', on: true })).toBe(false);
    expect(h.session.sendControl({ t: 'camera', on: true })).toBe(false);
    expect(h.session.sendControl({ t: 'hangup' })).toBe(true);
    expect(channel.sent).toEqual(['{"t":"hangup"}']);
  });

  it('mutes the local audio and tells the peer', async () => {
    const stream = localStream(['audio', 'video']);
    const h = build('caller', { localStream: stream });
    h.session.start();
    await settle();
    await verify(h);

    h.session.setMuted(true);

    expect(stream.getAudioTracks()[0]?.enabled).toBe(false);
    expect(h.connection.channels[0]?.sent).toEqual(['{"t":"mute","on":true}']);
  });
});

describe('bitrate caps and degrade', () => {
  async function connected(options: Partial<PeerSessionOptions> = {}) {
    const h = build('caller', options);
    h.session.start();
    await settle();
    await verify(h);
    return h;
  }

  function bitrate(h: Harness, kind: string): unknown {
    return h.connection.transceivers.find((transceiver) => transceiver.receiver.track.kind === kind)?.sender.parameters.encodings[0]?.maxBitrate;
  }

  it('caps audio at 32 kbps and video at 1.5 Mbps', async () => {
    const h = await connected();

    expect(bitrate(h, 'audio')).toBe(AUDIO_MAX_BITRATE);
    expect(bitrate(h, 'video')).toBe(VIDEO_MAX_BITRATE);
  });

  it('lowers the video cap and halves the resolution for video-360', async () => {
    const h = await connected({ degrade: 'video-360' });

    expect(bitrate(h, 'video')).toBe(VIDEO_DEGRADED_MAX_BITRATE);
    expect(h.connection.transceivers[1]?.sender.parameters.encodings[0]?.scaleResolutionDownBy).toBe(2);
    expect(h.degrades).toContain('video-360');
  });

  it('drops video for audio-only-relay when the call is relayed', async () => {
    const h = build('caller', { degrade: 'audio-only-relay' });
    relayed(h.connection);
    h.session.start();
    await settle();
    await verify(h);

    expect(h.connection.transceivers[1]?.sender.track).toBeNull();
    expect(h.degrades).toContain('audio-only-relay');
  });

  it('keeps video for audio-only-relay when the path is direct', async () => {
    const h = await connected({ degrade: 'audio-only-relay' });

    expect(h.connection.transceivers[1]?.sender.track).not.toBeNull();
  });

  it('replaces the video track without renegotiating', async () => {
    const h = await connected({ localStream: localStream(['audio']) });
    const offers = h.signals.filter((signal) => signal.type === 'offer').length;

    await h.session.setVideoTrack({ kind: 'video' } as unknown as MediaStreamTrack);

    expect(h.connection.transceivers[1]?.sender.track).not.toBeNull();
    expect(h.signals.filter((signal) => signal.type === 'offer')).toHaveLength(offers);
  });
});

describe('credential refresh', () => {
  it('refreshes ice servers at 3h30 with setConfiguration and keeps refreshing', async () => {
    const fresh = [{ urls: 'turn:fresh.example:3478', username: 'n', credential: 'k' }];
    const refresh = vi.fn().mockResolvedValue({ iceServers: fresh });
    const h = build('caller', { refreshIceServers: refresh });
    h.session.start();
    await settle();

    await vi.advanceTimersByTimeAsync(CREDENTIAL_REFRESH_MS - 1);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(h.connection.configuration.iceServers).toEqual(fresh);
    expect(h.connection.configuration.bundlePolicy).toBe('max-bundle');

    await vi.advanceTimersByTimeAsync(CREDENTIAL_REFRESH_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('survives a failed refresh', async () => {
    const refresh = vi.fn().mockRejectedValue(new Error('network'));
    const h = build('caller', { refreshIceServers: refresh });
    h.session.start();

    await vi.advanceTimersByTimeAsync(CREDENTIAL_REFRESH_MS * 2);

    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe('close', () => {
  it('stops timers, closes the connection and ignores later signals', async () => {
    const h = build('caller', { refreshIceServers: vi.fn() });
    h.session.start();
    await settle();

    h.session.close();
    await vi.advanceTimersByTimeAsync(CREDENTIAL_REFRESH_MS * 2);
    await h.session.receiveSignal('answer', remoteDescription('answer'));
    h.connection.onicecandidate?.({ candidate: { candidate: RELAY } });

    expect(h.connection.closed).toBe(true);
    expect(h.connection.restartCalls).toBe(0);
    expect(h.connection.remoteDescription).toBeNull();
    expect(h.signals.filter((signal) => signal.type === 'candidate')).toHaveLength(0);
  });
});
