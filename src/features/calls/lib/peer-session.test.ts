import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallRole, SignalType } from '@lib/e2ee/call-crypto';
import {
  AUDIO_MAX_BITRATE,
  CONNECT_RESTART_DELAY_MS,
  FAILED_RELAY_AFTER_MS,
  INITIAL_RELAY_FALLBACK_MS,
  KEEPALIVE_INTERVAL_MS,
  RELAY_PROBE_INTERVAL_MS,
  directServers,
  hasRelay,
  restartUsesRelay,
  retryDelay,
  CONTROL_CHANNEL_ID,
  CONTROL_CHANNEL_LABEL,
  CREDENTIAL_REFRESH_MS,
  DISCONNECTED_RESTART_DELAY_MS,
  DTLS_VERIFY_TIMEOUT_MS,
  MAX_REMOTE_CANDIDATES,
  PeerSession,
  SCREEN_DEGRADED_MAX_BITRATE,
  SCREEN_MAX_BITRATE,
  VIDEO_DEGRADED_MAX_BITRATE,
  VIDEO_MAX_BITRATE,
  VIDEO_UNSTABLE_MAX_BITRATE,
  extractSdpFingerprints,
  parseControlMessage,
  preferredAudioCodecs,
  sanitizeScreenLabel,
  screenControl,
  screenEncoding,
  directMovieBitrate,
  enableShareStereo,
  MOVIE_4K_MAX_BITRATE,
  MOVIE_1440_MAX_BITRATE,
  MOVIE_1080_MAX_BITRATE,
  MOVIE_RELAY_MAX_BITRATE,
  MOVIE_DEGRADED_MAX_BITRATE,
  MOVIE_AUDIO_MAX_BITRATE,
  screenAudioCodecs,
  screenVideoCodecs,
  senderParameters,
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
  parameters: { encodings: Array<Record<string, unknown>>; degradationPreference?: string } = { encodings: [] };
  rejectExtended = false;
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
  setParameters(parameters: { encodings: Array<Record<string, unknown>>; degradationPreference?: string }): Promise<void> {
    if (this.rejectExtended && (parameters.degradationPreference !== undefined || parameters.encodings.some((encoding) => 'priority' in encoding))) {
      return Promise.reject(new Error('unsupported'));
    }
    this.parameters = structuredClone(parameters);
    return Promise.resolve();
  }
}

class FakeTransceiver {
  readonly sender: FakeSender;
  readonly receiver: { track: { kind: string } };
  direction = 'sendrecv';
  codecs: Array<{ mimeType: string; sdpFmtpLine?: string }> | null = null;
  constructor(kind: string, track: { kind: string } | null) {
    this.sender = new FakeSender(track);
    this.receiver = { track: { kind } };
  }
  setCodecPreferences(codecs: Array<{ mimeType: string; sdpFmtpLine?: string }>): void {
    this.codecs = codecs;
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

function withoutDeps(overrides: Partial<PeerSessionOptions>): Partial<PeerSessionOptions> {
  const copy = { ...overrides };
  delete copy.deps;
  return copy;
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
      ...overrides.deps,
    },
    ...withoutDeps(overrides),
  });
  harness.session = session;
  harness.connection = connection;
  return harness;
}

function peerCaps(h: Harness, screen = true): void {
  h.connection.channels[0]?.onmessage?.({ data: JSON.stringify({ t: 'caps', screen }) });
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
    expect(parseControlMessage('{"t":"screen","on":true}')).toEqual({ t: 'screen', on: true });
    expect(parseControlMessage('{"t":"caps","screen":true}')).toEqual({ t: 'caps', screen: true });
    expect(parseControlMessage('{"t":"caps","screen":"yes"}')).toBeNull();
    for (const raw of ['', 'x', '{"t":"mute"}', '{"t":"screen"}', '{"t":"screen","on":1}', '{"t":"mute","on":"yes"}', '{"t":"other"}', '[]', 5, `{"t":"hangup","pad":"${'a'.repeat(300)}"}`]) {
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
    expect(h.connection.transceivers.map((transceiver) => transceiver.receiver.track.kind)).toEqual(['audio', 'video', 'video', 'audio']);
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

  it('starts direct only and falls back to the relay when nothing connects within 8 seconds', async () => {
    const h = build('caller');
    h.session.start();
    await settle();
    expect(JSON.stringify(h.connection.configuration.iceServers)).not.toContain('turn:');

    await vi.advanceTimersByTimeAsync(INITIAL_RELAY_FALLBACK_MS - 1);
    expect(h.connection.restartCalls).toBe(0);
    await vi.advanceTimersByTimeAsync(1);

    expect(h.connection.restartCalls).toBe(1);
    expect(JSON.stringify(h.connection.configuration.iceServers)).toContain('turn:');
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
    expect(h.connection.transceivers.map((transceiver) => transceiver.sender.track !== null)).toEqual([true, true, false, false]);
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
    channel.onmessage?.({ data: '{"t":"screen","on":true}' });
    expect(h.controls).toEqual([]);
    await verify(h);
    channel.onmessage?.({ data: '{"t":"screen","on":true}' });
    expect(h.controls).toEqual([{ t: 'screen', on: true }]);
    h.controls.length = 0;
    channel.onmessage?.({ data: '{"t":"hangup"}' });
    channel.onmessage?.({ data: 'junk' });
    expect(h.controls).toEqual([{ t: 'hangup' }]);

    expect(h.session.sendControl({ t: 'mute', on: true })).toBe(true);
    expect(channel.sent).toEqual(['{"t":"caps","screen":true}', '{"t":"mute","on":true}']);
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
    expect(h.session.sendControl({ t: 'screen', on: true })).toBe(false);
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
    expect(h.connection.channels[0]?.sent).toEqual(['{"t":"caps","screen":true}', '{"t":"mute","on":true}']);
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

const AUDIO_CODECS = [
  { mimeType: 'audio/opus', clockRate: 48000, channels: 2, sdpFmtpLine: 'minptime=10;useinbandfec=1' },
  { mimeType: 'audio/red', clockRate: 48000, channels: 2 },
  { mimeType: 'audio/G722', clockRate: 8000 },
  { mimeType: 'audio/PCMU', clockRate: 8000 },
];

const VIDEO_CODECS = [
  { mimeType: 'video/VP8', clockRate: 90000 },
  { mimeType: 'video/rtx', clockRate: 90000 },
  { mimeType: 'video/VP9', clockRate: 90000, sdpFmtpLine: 'profile-id=0' },
  { mimeType: 'video/VP9', clockRate: 90000, sdpFmtpLine: 'profile-id=2' },
  { mimeType: 'video/H264', clockRate: 90000, sdpFmtpLine: 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f' },
  { mimeType: 'video/H264', clockRate: 90000, sdpFmtpLine: 'level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=42e01f' },
  { mimeType: 'video/H264', clockRate: 90000, sdpFmtpLine: 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=640034' },
  { mimeType: 'video/AV1', clockRate: 90000 },
  { mimeType: 'video/H265', clockRate: 90000 },
  { mimeType: 'video/red', clockRate: 90000 },
  { mimeType: 'video/ulpfec', clockRate: 90000 },
];

function capabilities(kind: 'audio' | 'video'): RTCRtpCodec[] {
  return (kind === 'audio' ? AUDIO_CODECS : VIDEO_CODECS);
}

function track(kind: string) {
  return { kind, contentHint: '' } as unknown as MediaStreamTrack;
}

function recordingStream() {
  const tracks: unknown[] = [];
  return { id: '', tracks, addTrack: (added: unknown) => tracks.push(added) } as unknown as MediaStream & { tracks: unknown[] };
}

describe('codec preferences', () => {
  it('prefers opus red, then opus, then everything else', () => {
    expect(preferredAudioCodecs(capabilities('audio')).map((codec) => codec.mimeType)).toEqual(['audio/red', 'audio/opus', 'audio/G722', 'audio/PCMU']);
  });

  it('keeps opus first without red and changes nothing when opus is missing', () => {
    const withoutRed = capabilities('audio').filter((codec) => codec.mimeType !== 'audio/red');
    expect(preferredAudioCodecs(withoutRed).map((codec) => codec.mimeType)).toEqual(['audio/opus', 'audio/G722', 'audio/PCMU']);
    expect(preferredAudioCodecs(capabilities('audio').filter((codec) => codec.mimeType !== 'audio/opus'))).toEqual([]);
  });

  it('keeps only compact codecs for the screen so the offer stays inside the signal size limit', () => {
    expect(screenVideoCodecs(capabilities('video')).map((codec) => `${codec.mimeType} ${codec.sdpFmtpLine ?? ''}`.trim())).toEqual([
      'video/VP9 profile-id=0',
      'video/AV1',
      'video/VP8',
      'video/H264 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f',
      'video/rtx',
    ]);
    expect(screenVideoCodecs(capabilities('video').filter((codec) => !['video/VP8', 'video/VP9', 'video/H264'].includes(codec.mimeType)))).toEqual([]);
    expect(screenAudioCodecs(capabilities('audio')).map((codec) => codec.mimeType)).toEqual(['audio/opus']);
  });

  it('applies the preferences on the caller transceivers before the offer', async () => {
    const h = build('caller', { deps: { codecCapabilities: capabilities } });
    h.session.start();
    await settle();

    const [audio, camera, screen, screenAudio] = h.connection.transceivers;
    expect(audio?.codecs?.map((codec) => codec.mimeType).slice(0, 2)).toEqual(['audio/red', 'audio/opus']);
    expect(camera?.codecs).toBeNull();
    expect(screen?.codecs?.map((codec) => codec.mimeType)).toEqual(['video/VP9', 'video/AV1', 'video/VP8', 'video/H264', 'video/rtx']);
    expect(screenAudio?.codecs?.map((codec) => codec.mimeType)).toEqual(['audio/opus']);
  });

  it('applies the preferences on the callee before answering', async () => {
    const h = build('callee', { deps: { codecCapabilities: capabilities } });
    h.session.start();
    h.connection.transceivers.push(new FakeTransceiver('audio', null), new FakeTransceiver('video', null), new FakeTransceiver('video', null), new FakeTransceiver('audio', null));
    for (const transceiver of h.connection.transceivers) {
      transceiver.direction = 'recvonly';
    }

    await h.session.receiveSignal('offer', remoteDescription('offer'));

    expect(h.connection.transceivers.every((transceiver) => transceiver.direction === 'sendrecv')).toBe(true);
    expect(h.connection.transceivers[0]?.codecs?.[0]?.mimeType).toBe('audio/red');
    expect(h.connection.transceivers[2]?.codecs?.map((codec) => codec.mimeType)).toEqual(['video/VP9', 'video/AV1', 'video/VP8', 'video/H264', 'video/rtx']);
    expect(h.signals.map((signal) => signal.type)).toEqual(['answer']);
  });

  it('keeps working when the browser has no codec capabilities', async () => {
    const h = build('caller', { deps: { codecCapabilities: () => [] } });
    h.session.start();
    await settle();

    expect(h.connection.transceivers.every((transceiver) => transceiver.codecs === null)).toBe(true);
    expect(h.signals[0]?.type).toBe('offer');
  });
});

describe('screen share transport', () => {
  async function verifiedCaller(options: Partial<PeerSessionOptions> = {}) {
    const h = build('caller', options);
    h.session.start();
    await settle();
    await verify(h);
    peerCaps(h);
    return h;
  }

  it('refuses to send the screen before the certificate is verified', async () => {
    const h = build('caller');
    h.session.start();
    await settle();
    await h.session.receiveSignal('answer', remoteDescription('answer'));
    h.connection.setIce('connected');
    await settle();

    expect(h.session.canShareScreen()).toBe(false);
    expect(await h.session.setScreenTracks(track('video'), track('audio'))).toBe(false);
    expect(h.connection.transceivers[2]?.sender.track).toBeNull();
    expect(h.connection.transceivers[3]?.sender.track).toBeNull();
    expect(h.connection.channels[0]?.sent).toEqual([]);
  });

  it('starts and stops sharing with replaceTrack on the screen transceivers without renegotiating', async () => {
    const h = await verifiedCaller();
    const offers = h.signals.filter((signal) => signal.type === 'offer').length;
    const video = track('video');
    const audio = track('audio');

    expect(h.session.canShareScreen()).toBe(true);
    expect(await h.session.setScreenTracks(video, audio)).toBe(true);

    expect(h.connection.transceivers[2]?.sender.track).toBe(video);
    expect(h.connection.transceivers[3]?.sender.track).toBe(audio);
    expect(video.contentHint).toBe('detail');
    expect(h.connection.transceivers[1]?.sender.track).toEqual({ kind: 'video', enabled: true });
    expect(h.connection.channels[0]?.sent.at(-1)).toBe('{"t":"screen","on":true}');

    expect(await h.session.setScreenTracks(null)).toBe(true);

    expect(h.connection.transceivers[2]?.sender.track).toBeNull();
    expect(h.connection.transceivers[3]?.sender.track).toBeNull();
    expect(h.connection.channels[0]?.sent.at(-1)).toBe('{"t":"screen","on":false}');
    expect(h.signals.filter((signal) => signal.type === 'offer')).toHaveLength(offers);
  });

  it('caps the screen at about 2.5 Mbps keeping resolution and lowers it for video-360', async () => {
    const h = await verifiedCaller();
    await h.session.setScreenTracks(track('video'));

    const screen = h.connection.transceivers[2]!.sender.parameters;
    expect(screen.encodings[0]?.maxBitrate).toBe(SCREEN_MAX_BITRATE);
    expect(screen.degradationPreference).toBe('maintain-resolution');
    expect(h.connection.transceivers[1]!.sender.parameters.degradationPreference).toBe('maintain-framerate');

    await h.session.applyDegrade('video-360');
    expect(h.connection.transceivers[2]!.sender.parameters.encodings[0]?.maxBitrate).toBe(SCREEN_DEGRADED_MAX_BITRATE);
  });

  it('marks the voice sender as high priority and keeps the 32 kbps cap', async () => {
    const h = await verifiedCaller();

    expect(h.connection.transceivers[0]!.sender.parameters.encodings[0]).toMatchObject({ maxBitrate: AUDIO_MAX_BITRATE, priority: 'high', networkPriority: 'high' });
  });

  it('still applies the bitrate caps when the browser rejects priority or degradation preference', async () => {
    const h = build('caller');
    h.session.start();
    await settle();
    for (const transceiver of h.connection.transceivers) {
      transceiver.sender.rejectExtended = true;
    }
    await verify(h);

    expect(h.connection.transceivers[0]!.sender.parameters.encodings[0]?.maxBitrate).toBe(AUDIO_MAX_BITRATE);
    expect(h.connection.transceivers[0]!.sender.parameters.encodings[0]).not.toHaveProperty('priority');
    expect(h.connection.transceivers[1]!.sender.parameters.encodings[0]?.maxBitrate).toBe(VIDEO_MAX_BITRATE);
  });

  it('stops an active share and refuses new ones when audio-only-relay applies on a relayed path', async () => {
    const h = build('caller');
    h.session.start();
    await settle();
    await verify(h);
    peerCaps(h);
    await h.session.setScreenTracks(track('video'), track('audio'));
    relayed(h.connection);

    await h.session.applyDegrade('audio-only-relay');

    expect(h.connection.transceivers[2]?.sender.track).toBeNull();
    expect(h.connection.transceivers[3]?.sender.track).toBeNull();
    expect(h.connection.channels[0]?.sent).toContain('{"t":"screen","on":false}');
    expect(h.degrades).toContain('audio-only-relay');
    expect(await h.session.setScreenTracks(track('video'))).toBe(false);
    expect(h.connection.transceivers[2]?.sender.track).toBeNull();
  });

  it('cannot share when the other side offered only audio and camera', async () => {
    const h = build('callee');
    h.session.start();
    h.connection.transceivers.push(new FakeTransceiver('audio', null), new FakeTransceiver('video', null));
    await h.session.receiveSignal('offer', remoteDescription('offer'));
    h.connection.setIce('connected');
    h.connection.setDtls('connected');
    await settle();

    expect(h.session.canShareScreen()).toBe(false);
    expect(await h.session.setScreenTracks(track('video'))).toBe(false);
  });

  it('lowers the camera while the network is unstable and restores it afterwards', async () => {
    const h = await verifiedCaller();

    await h.session.setNetworkUnstable(true);
    expect(h.connection.transceivers[1]!.sender.parameters.encodings[0]).toMatchObject({ maxBitrate: VIDEO_UNSTABLE_MAX_BITRATE, scaleResolutionDownBy: 2 });

    await h.session.setNetworkUnstable(false);
    expect(h.connection.transceivers[1]!.sender.parameters.encodings[0]).toMatchObject({ maxBitrate: VIDEO_MAX_BITRATE, scaleResolutionDownBy: 1 });
  });

  it('routes the remote screen tracks to their own stream and holds them until verification', async () => {
    const screenStream = recordingStream();
    const cameraStream = recordingStream();
    const screens: MediaStream[] = [];
    const created = [cameraStream, screenStream];
    const h = build('caller', {
      onRemoteScreen: (stream) => screens.push(stream),
      deps: { createStream: () => created.shift() as MediaStream },
    });
    h.session.start();
    await settle();
    await h.session.receiveSignal('answer', remoteDescription('answer'));
    const [audio, camera, screen, screenAudio] = h.connection.transceivers;
    h.connection.ontrack?.({ streams: [], track: audio!.receiver.track, transceiver: audio });
    h.connection.ontrack?.({ streams: [], track: camera!.receiver.track, transceiver: camera });
    h.connection.ontrack?.({ streams: [], track: screen!.receiver.track, transceiver: screen });
    h.connection.ontrack?.({ streams: [], track: screenAudio!.receiver.track, transceiver: screenAudio });
    h.connection.setIce('connected');
    await settle();

    expect(screens).toEqual([]);
    expect(h.streams).toEqual([]);

    h.connection.setDtls('connected');
    await settle();

    expect(h.streams).toEqual([cameraStream]);
    expect(cameraStream.tracks).toEqual([audio!.receiver.track, camera!.receiver.track]);
    expect(screens).toEqual([screenStream]);
    expect(screenStream.tracks).toEqual([screen!.receiver.track, screenAudio!.receiver.track]);
  });

  it('never exposes the remote screen when verification fails', async () => {
    const screens: MediaStream[] = [];
    const h = build('caller', { onRemoteScreen: (stream) => screens.push(stream) }, 'DD:DD:DD');
    h.session.start();
    await settle();
    await h.session.receiveSignal('answer', remoteDescription('answer'));
    const screen = h.connection.transceivers[2]!;
    h.connection.ontrack?.({ streams: [], track: screen.receiver.track, transceiver: screen });
    h.connection.setIce('connected');
    h.connection.setDtls('connected');
    await settle();

    expect(h.fatals).toEqual(['fingerprint-mismatch']);
    expect(screens).toEqual([]);
  });

  it('builds sender parameters with and without the optional fields', () => {
    const base = { transactionId: 't', encodings: [{ active: true }], codecs: [], headerExtensions: [], rtcp: {} } as unknown as RTCRtpSendParameters;
    expect(senderParameters(base, { maxBitrate: 1, priority: 'high', degradationPreference: 'maintain-resolution' }, true)).toMatchObject({
      degradationPreference: 'maintain-resolution',
      encodings: [{ active: true, maxBitrate: 1, priority: 'high', networkPriority: 'high' }],
    });
    const plain = senderParameters(base, { maxBitrate: 1, priority: 'high', degradationPreference: 'maintain-resolution' }, false);
    expect(plain).not.toHaveProperty('degradationPreference');
    expect(plain.encodings[0]).toEqual({ active: true, maxBitrate: 1 });
    expect(base.encodings[0]).toEqual({ active: true });
  });
});

describe('screen share capabilities', () => {
  async function verifiedWithoutCaps() {
    const h = build('caller');
    h.session.start();
    await settle();
    await verify(h);
    return h;
  }

  it('announces its own screen capability only after verification', async () => {
    const h = build('caller');
    h.session.start();
    await settle();
    expect(h.connection.channels[0]?.sent).toEqual([]);

    await verify(h);

    expect(h.connection.channels[0]?.sent).toEqual(['{"t":"caps","screen":true}']);
  });

  it('announces again when the control channel opens after verification', async () => {
    const h = await verifiedWithoutCaps();
    const channel = h.connection.channels[0] as unknown as { onopen?: () => void; sent: string[] };
    channel.onopen?.();
    expect(channel.sent.filter((message) => message.includes('caps'))).toHaveLength(2);
  });

  it('never attaches screen tracks toward a peer that has not announced screen support', async () => {
    const h = await verifiedWithoutCaps();

    expect(h.session.canShareScreen()).toBe(false);
    expect(await h.session.setScreenTracks(track('video'), track('audio'))).toBe(false);
    expect(h.connection.transceivers[2]?.sender.track).toBeNull();
    expect(h.connection.transceivers[3]?.sender.track).toBeNull();

    peerCaps(h, false);
    expect(h.session.canShareScreen()).toBe(false);

    peerCaps(h);
    expect(h.session.canShareScreen()).toBe(true);
    expect(h.controls).toContainEqual({ t: 'caps', screen: true });
    expect(await h.session.setScreenTracks(track('video'))).toBe(true);
  });

  it('ignores capability messages received before verification', async () => {
    const h = build('caller');
    h.session.start();
    await settle();
    peerCaps(h);
    await verify(h);

    expect(h.session.canShareScreen()).toBe(false);
  });
});

describe('screen share info', () => {
  it('accepts the old screen message shape and the new one with surface and label', () => {
    expect(parseControlMessage('{"t":"screen","on":true}')).toEqual({ t: 'screen', on: true });
    expect(parseControlMessage('{"t":"screen","on":true,"surface":"window","label":"Docs"}')).toEqual({ t: 'screen', on: true, surface: 'window', label: 'Docs' });
  });

  it('drops invalid surfaces, non string labels and info on stop', () => {
    expect(parseControlMessage('{"t":"screen","on":true,"surface":"desk","label":5}')).toEqual({ t: 'screen', on: true });
    expect(parseControlMessage('{"t":"screen","on":false,"surface":"window","label":"x"}')).toEqual({ t: 'screen', on: false });
  });

  it('strips control and bidi characters and caps the label at 80 characters', () => {
    expect(sanitizeScreenLabel('  a\u0000b\u202ec\n ')).toBe('abc');
    expect(sanitizeScreenLabel('x'.repeat(200))).toHaveLength(80);
    expect(sanitizeScreenLabel('\u0007')).toBeNull();
    expect(sanitizeScreenLabel({})).toBeNull();
    expect(parseControlMessage(JSON.stringify({ t: 'screen', on: true, label: '<b>' + 'y'.repeat(120) }))).toMatchObject({ label: '<b>' + 'y'.repeat(77) });
  });

  it('builds messages that always fit the control size limit', () => {
    const message = screenControl(true, { surface: 'browser', label: '"\\'.repeat(60) });
    expect(JSON.stringify(message).length).toBeLessThanOrEqual(256);
    expect(parseControlMessage(JSON.stringify(message))).toEqual(message);
    expect(screenControl(false, { surface: 'browser', label: 'x' })).toEqual({ t: 'screen', on: false });
    expect(screenControl(true, { surface: 'monitor', label: null })).toEqual({ t: 'screen', on: true, surface: 'monitor' });
  });

  it('sends the surface with the start message and re-sends it only while sharing', async () => {
    const h = build('caller');
    h.session.start();
    await settle();
    await verify(h);
    h.connection.channels[0]?.onmessage?.({ data: '{"t":"caps","screen":true}' });
    const channel = h.connection.channels[0]!;

    expect(h.session.updateScreenInfo({ surface: 'window', label: 'A' })).toBe(false);
    await h.session.setScreenTracks({ kind: 'video', contentHint: '' } as unknown as MediaStreamTrack, null, { surface: 'browser', label: 'Tab' });
    expect(channel.sent.at(-1)).toBe('{"t":"screen","on":true,"surface":"browser","label":"Tab"}');

    expect(h.session.updateScreenInfo({ surface: 'window', label: 'Editor' })).toBe(true);
    expect(channel.sent.at(-1)).toBe('{"t":"screen","on":true,"surface":"window","label":"Editor"}');

    await h.session.setScreenTracks(null);
    expect(channel.sent.at(-1)).toBe('{"t":"screen","on":false}');
  });
});

describe('review hardening for screen info', () => {
  it('strips invisible format characters from labels', () => {
    expect(sanitizeScreenLabel('a\u200eb\u200fc\u061cd\u200be\u2060f\ufeffg\u{e0041}h')).toBe('abcdefgh');
  });

  it('carries a validated audio flag only while sharing', () => {
    expect(parseControlMessage('{"t":"screen","on":true,"audio":true}')).toEqual({ t: 'screen', on: true, audio: true });
    expect(parseControlMessage('{"t":"screen","on":true,"audio":"yes"}')).toEqual({ t: 'screen', on: true });
    expect(parseControlMessage('{"t":"screen","on":false,"audio":true}')).toEqual({ t: 'screen', on: false });
    expect(screenControl(true, { surface: 'window', label: null, audio: false })).toEqual({ t: 'screen', on: true, surface: 'window', audio: false });
  });
});

describe('movie mode encodings', () => {
  it('keeps the sharp text profile when movie mode is off', () => {
    expect(screenEncoding({ movie: false, relayed: false, degrade: null, width: 3840, height: 2160 })).toEqual({ maxBitrate: SCREEN_MAX_BITRATE, scaleResolutionDownBy: 1, degradationPreference: 'maintain-resolution' });
  });

  it('picks the direct bitrate from the source resolution without capping it', () => {
    expect(screenEncoding({ movie: true, relayed: false, degrade: null, width: 3840, height: 2160 })).toEqual({ maxBitrate: MOVIE_4K_MAX_BITRATE, scaleResolutionDownBy: 1, maxFramerate: 30, degradationPreference: 'maintain-framerate' });
    expect(directMovieBitrate(2560, 1440)).toBe(MOVIE_1440_MAX_BITRATE);
    expect(directMovieBitrate(1920, 1080)).toBe(MOVIE_1080_MAX_BITRATE);
    expect(directMovieBitrate(null, null)).toBe(MOVIE_1080_MAX_BITRATE);
  });

  it('allows 60 fps only for a high frame rate source when the uplink estimate covers the bitrate', () => {
    expect(screenEncoding({ movie: true, relayed: false, degrade: null, width: 1920, height: 1080, frameRate: 60, uplinkBps: 9_000_000 }).maxFramerate).toBe(60);
    expect(screenEncoding({ movie: true, relayed: false, degrade: null, width: 1920, height: 1080, frameRate: 60, uplinkBps: 3_000_000 }).maxFramerate).toBe(30);
    expect(screenEncoding({ movie: true, relayed: false, degrade: null, width: 1920, height: 1080, frameRate: 60, uplinkBps: null }).maxFramerate).toBe(30);
  });

  it('caps a relayed movie share at 1080p and 4 Mbps', () => {
    expect(screenEncoding({ movie: true, relayed: true, degrade: null, width: 3840, height: 2160 })).toEqual({ maxBitrate: MOVIE_RELAY_MAX_BITRATE, scaleResolutionDownBy: 2, maxFramerate: 30, degradationPreference: 'maintain-framerate' });
  });

  it('lets the server video-360 step win over everything', () => {
    expect(screenEncoding({ movie: true, relayed: false, degrade: 'video-360', width: 2560, height: 1440 })).toEqual({ maxBitrate: MOVIE_DEGRADED_MAX_BITRATE, scaleResolutionDownBy: 2, maxFramerate: 30, degradationPreference: 'maintain-framerate' });
    expect(screenEncoding({ movie: false, relayed: false, degrade: 'video-360', width: 2560, height: 1440 }).maxBitrate).toBe(SCREEN_DEGRADED_MAX_BITRATE);
  });

  it('applies the movie profile live and restores the text profile', async () => {
    const h = build('caller');
    h.session.start();
    await settle();
    await verify(h);
    h.connection.channels[0]?.onmessage?.({ data: '{"t":"caps","screen":true}' });
    const video = { kind: 'video', contentHint: '', getSettings: () => ({ width: 3840, height: 2160 }) } as unknown as MediaStreamTrack;
    await h.session.setScreenTracks(video, null);

    await h.session.setMovieMode(true);
    expect(video.contentHint).toBe('motion');
    expect(h.connection.transceivers[2]!.sender.parameters.encodings[0]).toMatchObject({ maxBitrate: MOVIE_4K_MAX_BITRATE, maxFramerate: 30 });
    expect(h.connection.transceivers[2]!.sender.parameters.degradationPreference).toBe('maintain-framerate');
    expect(h.connection.transceivers[3]!.sender.parameters.encodings[0]?.maxBitrate).toBe(MOVIE_AUDIO_MAX_BITRATE);

    await h.session.setMovieMode(false);
    expect(video.contentHint).toBe('detail');
    expect(h.connection.transceivers[2]!.sender.parameters.encodings[0]).toMatchObject({ maxBitrate: SCREEN_MAX_BITRATE });
    expect(h.connection.transceivers[2]!.sender.parameters.encodings[0]).not.toHaveProperty('maxFramerate');
  });
});

describe('share audio stereo', () => {
  const sdp = [
    'v=0',
    'm=audio 9 UDP/TLS/RTP/SAVPF 111 63',
    'a=mid:0',
    'a=rtpmap:111 opus/48000/2',
    'a=fmtp:111 minptime=10;useinbandfec=1',
    'm=video 9 UDP/TLS/RTP/SAVPF 96',
    'a=mid:1',
    'm=audio 9 UDP/TLS/RTP/SAVPF 111',
    'a=mid:3',
    'a=rtpmap:111 opus/48000/2',
    'a=fmtp:111 minptime=10;useinbandfec=1',
    '',
  ].join('\r\n');

  it('enables high quality stereo only on the second audio section', () => {
    const munged = enableShareStereo(sdp);
    const [voice, share] = munged.split('m=audio').slice(1);
    expect(voice).toContain('a=fmtp:111 minptime=10;useinbandfec=1\r\n');
    expect(share).toContain('a=fmtp:111 minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=192000;cbr=0;usedtx=0\r\n');
    expect(munged.replace(/;stereo=1;sprop-stereo=1;maxaveragebitrate=192000;cbr=0;usedtx=0/, '')).toBe(sdp);
  });

  it('adds an fmtp line when missing, keeps existing values and is idempotent', () => {
    const bare = sdp.replace('a=fmtp:111 minptime=10;useinbandfec=1\r\n\r\n', '\r\n').split('m=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=mid:3\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;useinbandfec=1').join('m=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=mid:3\r\na=rtpmap:111 opus/48000/2');
    expect(enableShareStereo(bare)).toContain('a=rtpmap:111 opus/48000/2\r\na=fmtp:111 stereo=1;sprop-stereo=1;maxaveragebitrate=192000;cbr=0;usedtx=0');
    const once = enableShareStereo(sdp);
    expect(enableShareStereo(once)).toBe(once);
    expect(enableShareStereo('v=0\r\nm=audio 9 X 0\r\na=rtpmap:0 PCMU/8000\r\n')).toBe('v=0\r\nm=audio 9 X 0\r\na=rtpmap:0 PCMU/8000\r\n');
  });

  it('keeps the dtls fingerprint lines untouched', () => {
    const withFingerprint = `v=0\r\na=fingerprint:sha-256 AA:BB\r\n${sdp.slice(5)}`;
    expect(extractSdpFingerprints(enableShareStereo(withFingerprint))).toEqual(['sha-256 AA:BB']);
  });
});

describe('screen message movie flag', () => {
  it('accepts a boolean movie flag only while sharing', () => {
    expect(parseControlMessage('{"t":"screen","on":true,"movie":true}')).toEqual({ t: 'screen', on: true, movie: true });
    expect(parseControlMessage('{"t":"screen","on":true,"movie":1}')).toEqual({ t: 'screen', on: true });
    expect(parseControlMessage('{"t":"screen","on":false,"movie":true}')).toEqual({ t: 'screen', on: false });
    expect(screenControl(true, { surface: 'browser', label: null, movie: true })).toEqual({ t: 'screen', on: true, surface: 'browser', movie: true });
  });
});

describe('local description munging', () => {
  it('sets the offer with share audio stereo enabled and sends the same description', async () => {
    const h = build('caller');
    const offer = 'v=0\r\na=fingerprint:sha-256 AA:AA:AA\r\nm=audio 9 X 111\r\na=rtpmap:111 opus/48000/2\r\nm=audio 9 X 111\r\na=rtpmap:111 opus/48000/2\r\n';
    const applied: Array<{ type: string; sdp: string } | undefined> = [];
    const connection = h.connection as unknown as Record<string, unknown>;
    connection.createOffer = () => Promise.resolve({ type: 'offer', sdp: offer });
    connection.setLocalDescription = (description?: { type: string; sdp: string }) => {
      applied.push(description);
      h.connection.localDescription = description ?? null;
      h.connection.signalingState = 'have-local-offer';
      return Promise.resolve();
    };
    h.session.start();
    await settle();

    expect(applied[0]?.sdp).toBe(enableShareStereo(offer));
    expect(applied[0]?.sdp).toContain('stereo=1');
    expect((h.signals[0]?.payload.description as { sdp: string }).sdp).toBe(applied[0]?.sdp);
    expect(h.signals[0]?.payload.fingerprints).toEqual(['sha-256 AA:AA:AA']);
  });
});

describe('connection recovery', () => {
  async function verifiedCall(options: Partial<PeerSessionOptions> = {}) {
    const restarts: Array<{ reason: string; relay: boolean }> = [];
    const h = build('caller', { onRestart: (reason, relay) => restarts.push({ reason, relay }), ...options });
    h.session.start();
    await settle();
    await verify(h);
    return { h, restarts };
  }

  const relayInConfig = (h: Harness) => JSON.stringify(h.connection.configuration.iceServers).includes('turn:');

  it('separates direct servers from relay servers', () => {
    expect(directServers([{ urls: ['stun:a', 'turn:b', 'turns:c'] }, { urls: 'turn:d' }])).toEqual([{ urls: ['stun:a'] }]);
    expect(hasRelay([{ urls: 'stun:a' }])).toBe(false);
    expect(hasRelay([{ urls: ['stun:a', 'turns:b'] }])).toBe(true);
  });

  it('uses the relay only after two direct attempts or 10 seconds of failure', () => {
    expect(restartUsesRelay(0, 0, 1_000)).toBe(false);
    expect(restartUsesRelay(1, 0, 9_999)).toBe(false);
    expect(restartUsesRelay(2, 0, 1_000)).toBe(true);
    expect(restartUsesRelay(0, 0, FAILED_RELAY_AFTER_MS)).toBe(true);
    expect([1, 2, 3, 4, 5, 9].map(retryDelay)).toEqual([3_000, 5_000, 8_000, 13_000, 15_000, 15_000]);
  });

  it('waits on disconnected, restarts direct twice with backoff, then adds the relay', async () => {
    const { h, restarts } = await verifiedCall();
    h.connection.setIce('disconnected');
    await vi.advanceTimersByTimeAsync(DISCONNECTED_RESTART_DELAY_MS);
    expect(restarts).toEqual([{ reason: 'disconnected', relay: false }]);
    expect(relayInConfig(h)).toBe(false);

    await vi.advanceTimersByTimeAsync(retryDelay(1));
    expect(restarts.at(-1)).toEqual({ reason: 'retry', relay: false });
    await vi.advanceTimersByTimeAsync(retryDelay(2));
    expect(restarts.at(-1)).toEqual({ reason: 'retry', relay: true });
    expect(relayInConfig(h)).toBe(true);
    expect(h.statuses).toContain('interrupted');
  });

  it('stops retrying and resets the attempts once connected again', async () => {
    const { h, restarts } = await verifiedCall();
    h.connection.setIce('failed');
    expect(restarts).toEqual([{ reason: 'failed', relay: false }]);
    h.connection.setIce('connected');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(restarts).toHaveLength(1);

    h.connection.setIce('failed');
    expect(restarts.at(-1)).toEqual({ reason: 'failed', relay: false });
  });

  it('only recovers on online or resync when ICE is actually unhealthy', async () => {
    const { h, restarts } = await verifiedCall();
    h.session.recoverIfUnhealthy('resync');
    h.session.recoverIfUnhealthy('online');
    expect(restarts).toEqual([]);
    expect(h.connection.restartCalls).toBe(0);

    h.connection.iceConnectionState = 'disconnected';
    h.session.recoverIfUnhealthy('online');
    expect(restarts).toEqual([{ reason: 'online', relay: false }]);
  });

  it('keeps a direct route alive with a control ping every 5 seconds after verification', async () => {
    const h = build('caller');
    h.session.start();
    await settle();
    await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS * 2);
    expect(h.connection.channels[0]?.sent).toEqual([]);

    await verify(h);
    const before = h.connection.channels[0]!.sent.length;
    await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS * 2);
    expect(h.connection.channels[0]!.sent.slice(before)).toEqual(['{"t":"ping"}', '{"t":"ping"}']);
  });

  it('swallows pings from the peer', async () => {
    const { h } = await verifiedCall();
    h.connection.channels[0]?.onmessage?.({ data: '{"t":"ping"}' });
    expect(h.controls).toEqual([]);
    expect(parseControlMessage('{"t":"ping"}')).toEqual({ t: 'ping' });
  });

  it('probes back to a direct route every minute while relayed, only when the call allows it', async () => {
    let allowed = false;
    const { h, restarts } = await verifiedCall({ canProbeDirect: () => allowed });
    h.connection.setIce('disconnected');
    await vi.advanceTimersByTimeAsync(DISCONNECTED_RESTART_DELAY_MS + retryDelay(1) + retryDelay(2));
    expect(relayInConfig(h)).toBe(true);
    relayed(h.connection);
    h.connection.setIce('connected');
    await settle();
    const count = restarts.length;

    await vi.advanceTimersByTimeAsync(RELAY_PROBE_INTERVAL_MS);
    expect(restarts).toHaveLength(count);
    allowed = true;
    await vi.advanceTimersByTimeAsync(RELAY_PROBE_INTERVAL_MS);
    expect(restarts.at(-1)).toEqual({ reason: 'probe', relay: true });

    h.connection.stats.clear();
    h.connection.setIce('connected');
    await settle();
    const afterDirect = restarts.length;
    await vi.advanceTimersByTimeAsync(RELAY_PROBE_INTERVAL_MS * 2);
    expect(restarts).toHaveLength(afterDirect);
  });

  it('clears every recovery timer on close', async () => {
    const { h, restarts } = await verifiedCall();
    h.connection.setIce('failed');
    h.session.close();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(restarts).toHaveLength(1);
  });
});
