import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setCurrentIdentity } from '@lib/e2ee/current-identity';
import { generateIdentity } from '@lib/e2ee/identity';
import { getActiveKtAlerts, resetKtAlerts } from './kt-alerts';
import type { SignedTreeHead } from './kt-crypto';
import { setKtBuildConfigForTests, setKtSocketConfig } from './kt-config';
import { loadOwnerState, saveOwnerState } from './kt-store';
import { FakeLog, FakeSocket, logServer, memoryKtStorage, newLogKeys, type FakeLogKeys, type ServerBehavior } from './kt-test-support';
import { checkWitness } from './kt-witness';

const OWNER = 'owner-1';
const WITNESS_URL = 'https://witness.example.test/head.json';

let keys: FakeLogKeys;

function leaves(count: number) {
  return Array.from({ length: count }, (_, i) => ({ userId: `u${i}`, version: 1, identityKey: `pub-${i}`, signingKey: `sign-${i}` }));
}

function witnessBody(head: SignedTreeHead): string {
  return JSON.stringify({ v: 1, size: head.size, root: head.root, issuedAt: head.issuedAt, signature: head.signature });
}

function setup(log: FakeLog, storedSize: number | null = log.leaves.length) {
  const socket = new FakeSocket();
  const behavior: ServerBehavior = { log };
  socket.server = logServer(behavior);
  setKtSocketConfig(socket.asSocket(), { logPublicKey: keys.publicKey });
  if (storedSize !== null) {
    saveOwnerState(OWNER, { logPublicKey: keys.publicKey, head: log.head(storedSize), ownKeys: [] });
  }
  return { socket, behavior };
}

beforeEach(async () => {
  memoryKtStorage();
  setKtBuildConfigForTests({ pinnedLogPublicKey: null, witnessUrl: WITNESS_URL });
  resetKtAlerts();
  keys = await newLogKeys();
  const identity = await generateIdentity();
  setCurrentIdentity({ userId: OWNER, publicKey: identity.publicKey, privateKey: identity.privateKey });
});

afterEach(() => {
  setCurrentIdentity(null);
  setKtBuildConfigForTests(null);
});

describe('checkWitness', () => {
  it('does nothing when no witness is configured', async () => {
    setKtBuildConfigForTests({ pinnedLogPublicKey: null, witnessUrl: null });
    const { socket } = setup(new FakeLog(keys, leaves(4)));
    let called = false;
    expect(await checkWitness(socket.asSocket(), () => ((called = true), Promise.resolve('')))).toBe('skipped');
    expect(called).toBe(false);
  });

  it('agrees when the witness holds the same head', async () => {
    const log = new FakeLog(keys, leaves(4));
    const { socket } = setup(log);
    expect(await checkWitness(socket.asSocket(), () => Promise.resolve(witnessBody(log.head())))).toBe('ok');
    expect(getActiveKtAlerts()).toEqual([]);
  });

  it('warns when the witness holds a different root for the same size', async () => {
    const log = new FakeLog(keys, leaves(4));
    const forked = log.clone();
    forked.leaves[1] = { userId: 'u1', version: 1, identityKey: 'pub-evil', signingKey: 'sign-evil' };
    const { socket } = setup(log);

    expect(await checkWitness(socket.asSocket(), () => Promise.resolve(witnessBody(forked.head())))).toBe('alert');
    expect(getActiveKtAlerts().map((alert) => alert.kind)).toEqual(['splitView']);
  });

  it('accepts a witness that lags behind a consistent history', async () => {
    const log = new FakeLog(keys, leaves(6));
    const { socket } = setup(log);
    expect(await checkWitness(socket.asSocket(), () => Promise.resolve(witnessBody(log.head(3))))).toBe('ok');
    expect(getActiveKtAlerts()).toEqual([]);
  });

  it('warns when the witness is behind but its history is not a prefix', async () => {
    const log = new FakeLog(keys, leaves(6));
    const old = log.clone();
    old.leaves.length = 3;
    old.leaves[0] = { userId: 'u0', version: 1, identityKey: 'pub-evil', signingKey: 'sign-evil' };
    const { socket } = setup(log);
    expect(await checkWitness(socket.asSocket(), () => Promise.resolve(witnessBody(old.head())))).toBe('alert');
    expect(getActiveKtAlerts().map((alert) => alert.kind)).toEqual(['splitView']);
  });

  it('advances the local head when the witness is ahead and the server proves consistency', async () => {
    const log = new FakeLog(keys, leaves(6));
    const { socket } = setup(log, 3);
    expect(await checkWitness(socket.asSocket(), () => Promise.resolve(witnessBody(log.head())))).toBe('ok');
    expect(loadOwnerState(OWNER).head?.size).toBe(6);
    expect(getActiveKtAlerts()).toEqual([]);
  });

  it('warns when the witness is ahead of what the server now shows (rollback)', async () => {
    const log = new FakeLog(keys, leaves(6));
    const rolledBack = log.clone();
    rolledBack.leaves.length = 4;
    const { socket } = setup(rolledBack, 4);
    expect(await checkWitness(socket.asSocket(), () => Promise.resolve(witnessBody(log.head())))).toBe('alert');
    expect(getActiveKtAlerts().map((alert) => alert.kind)).toEqual(['splitView']);
  });

  it('warns when the witness is ahead and the server history is inconsistent with it', async () => {
    const log = new FakeLog(keys, leaves(6));
    const rewritten = log.clone();
    rewritten.leaves[0] = { userId: 'u0', version: 1, identityKey: 'pub-evil', signingKey: 'sign-evil' };
    const { socket } = setup(rewritten, 4);
    expect(await checkWitness(socket.asSocket(), () => Promise.resolve(witnessBody(log.head())))).toBe('alert');
  });

  it('never raises an alarm when the witness is unreachable or returns junk', async () => {
    const log = new FakeLog(keys, leaves(4));
    const { socket } = setup(log);
    expect(await checkWitness(socket.asSocket(), () => Promise.reject(new Error('offline')))).toBe('unreachable');
    expect(await checkWitness(socket.asSocket(), () => Promise.resolve('<html>not json</html>'))).toBe('unreachable');
    expect(await checkWitness(socket.asSocket(), () => Promise.resolve(JSON.stringify({ v: 2 })))).toBe('unreachable');
    expect(await checkWitness(socket.asSocket(), () => Promise.resolve(JSON.stringify({ v: 1, size: 'x' })))).toBe('unreachable');
    expect(getActiveKtAlerts()).toEqual([]);
  });

  it('ignores a witness file that is not signed by the pinned log key', async () => {
    const log = new FakeLog(keys, leaves(4));
    const rogue = log.clone(await newLogKeys());
    const { socket } = setup(log);
    expect(await checkWitness(socket.asSocket(), () => Promise.resolve(witnessBody(rogue.head())))).toBe('unreachable');
    expect(getActiveKtAlerts()).toEqual([]);
  });

  it('stays silent when the server cannot answer the consistency question', async () => {
    const log = new FakeLog(keys, leaves(6));
    const { socket, behavior } = setup(log);
    behavior.failEvents = new Set(['kt:get-consistency']);
    expect(await checkWitness(socket.asSocket(), () => Promise.resolve(witnessBody(log.head(3))))).toBe('unreachable');
    expect(getActiveKtAlerts()).toEqual([]);
  });

  it('skips until the client has a verified head of its own', async () => {
    const log = new FakeLog(keys, leaves(4));
    const { socket } = setup(log, null);
    expect(await checkWitness(socket.asSocket(), () => Promise.resolve(witnessBody(log.head())))).toBe('skipped');
  });
});
