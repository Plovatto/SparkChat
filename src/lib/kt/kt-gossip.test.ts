import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCurrentIdentity } from '@lib/e2ee/current-identity';
import { generateIdentity, type Identity } from '@lib/e2ee/identity';
import { getSodium } from '@lib/e2ee/sodium';

const directory = vi.hoisted(() => ({
  keys: new Map<string, string>(),
  usable: [] as string[],
  status: new Map<string, string>(),
}));

vi.mock('@lib/e2ee/room-keys', () => ({
  lookupContactKey: (_socket: unknown, userId: string) => {
    const publicKey = directory.keys.get(userId);
    return Promise.resolve(publicKey ? { contactId: userId, status: directory.status.get(userId) ?? 'unverified', pin: { publicKey } } : null);
  },
}));

vi.mock('@lib/e2ee/contact-trust', () => ({
  isKeyUsable: (status: string) => status !== 'changed' && status !== 'invalid',
  listUsableContactIds: () => directory.usable,
}));

import { getActiveKtAlerts, resetKtAlerts } from './kt-alerts';
import { setKtBuildConfigForTests, setKtSocketConfig } from './kt-config';
import { gossipLatestHead, handleGossip, readAudit, resetGossipState } from './kt-gossip';
import { emptyOwnerState, loadOwnerState, saveOwnerState } from './kt-store';
import { FakeLog, FakeSocket, logServer, memoryKtStorage, newLogKeys, type FakeLogKeys } from './kt-test-support';

interface Party {
  id: string;
  identity: Identity;
  log: FakeLog;
  socket: FakeSocket;
}

let logKeys: FakeLogKeys;

function leaves(count: number) {
  return Array.from({ length: count }, (_, i) => ({ userId: `u${i}`, version: 1, identityKey: `pub-${i}`, signingKey: `sign-${i}` }));
}

async function party(id: string, log: FakeLog, keys: FakeLogKeys = logKeys): Promise<Party> {
  const identity = await generateIdentity();
  directory.keys.set(id, identity.publicKey);
  const socket = new FakeSocket();
  socket.server = logServer({ log });
  setKtSocketConfig(socket.asSocket(), { logPublicKey: keys.publicKey });
  return { id, identity, log, socket };
}

function actAs(who: Party): void {
  setCurrentIdentity({ userId: who.id, publicKey: who.identity.publicKey, privateKey: who.identity.privateKey });
}

function remember(who: Party, size: number = who.log.leaves.length, keys: FakeLogKeys = logKeys): void {
  saveOwnerState(who.id, { ...emptyOwnerState(), logPublicKey: keys.publicKey, head: who.log.head(size) });
}

async function send(from: Party, to: Party): Promise<{ from: string; envelope: string } | null> {
  actAs(from);
  directory.usable = [to.id];
  const before = from.socket.count('kt:gossip');
  await gossipLatestHead(from.socket.asSocket());
  const sent = from.socket.sent.filter((entry) => entry.event === 'kt:gossip').slice(before)[0];
  return sent ? { from: from.id, envelope: sent.payload.envelope as string } : null;
}

async function deliver(message: { from: string; envelope: string }, to: Party): Promise<void> {
  actAs(to);
  await handleGossip(to.socket.asSocket(), message);
}

beforeEach(async () => {
  memoryKtStorage();
  setKtBuildConfigForTests({ pinnedLogPublicKey: null, witnessUrl: null });
  resetKtAlerts();
  resetGossipState();
  directory.keys.clear();
  directory.status.clear();
  directory.usable = [];
  logKeys = await newLogKeys();
});

afterEach(() => {
  setCurrentIdentity(null);
  setKtBuildConfigForTests(null);
});

describe('gossip between contacts', () => {
  it('does nothing when both parties see the same log', async () => {
    const log = new FakeLog(logKeys, leaves(5));
    const alice = await party('alice', log);
    const bob = await party('bob', log.clone());
    remember(alice);
    remember(bob);

    const message = await send(alice, bob);
    expect(message).not.toBeNull();
    await deliver(message as { from: string; envelope: string }, bob);
    expect(getActiveKtAlerts()).toEqual([]);
  });

  it('shows the warning when two parties hold different roots for the same size', async () => {
    const log = new FakeLog(logKeys, leaves(5));
    const forked = log.clone();
    forked.leaves[2] = { userId: 'u2', version: 1, identityKey: 'pub-evil', signingKey: 'sign-evil' };
    const alice = await party('alice', log);
    const bob = await party('bob', forked);
    remember(alice);
    remember(bob);

    await deliver((await send(alice, bob)) as { from: string; envelope: string }, bob);

    expect(getActiveKtAlerts().map((alert) => alert.kind)).toEqual(['splitView']);
    expect(loadOwnerState('bob').head?.size).toBe(5);
  });

  it('accepts a larger head that is consistent with the local one', async () => {
    const log = new FakeLog(logKeys, leaves(5));
    const alice = await party('alice', log);
    const longer = log.clone();
    longer.append({ userId: 'x', version: 1, identityKey: 'pub-x', signingKey: '' });
    longer.append({ userId: 'y', version: 1, identityKey: 'pub-y', signingKey: '' });
    const bob = await party('bob', longer);
    remember(alice, 5);
    remember(bob);
    alice.socket.server = logServer({ log: longer });

    await deliver((await send(bob, alice)) as { from: string; envelope: string }, alice);
    expect(getActiveKtAlerts()).toEqual([]);

    await deliver((await send(alice, bob)) as { from: string; envelope: string }, bob);
    expect(getActiveKtAlerts()).toEqual([]);
  });

  it('warns when the other head is larger but inconsistent with the local history', async () => {
    const log = new FakeLog(logKeys, leaves(5));
    const alice = await party('alice', log);
    const rewritten = log.clone();
    rewritten.leaves[0] = { userId: 'u0', version: 1, identityKey: 'pub-evil', signingKey: 'sign-evil' };
    rewritten.append({ userId: 'x', version: 1, identityKey: 'pub-x', signingKey: '' });
    const bob = await party('bob', rewritten);
    remember(alice);
    remember(bob);
    alice.socket.server = logServer({ log: rewritten });

    await deliver((await send(bob, alice)) as { from: string; envelope: string }, alice);
    expect(getActiveKtAlerts().map((alert) => alert.kind)).toEqual(['splitView']);
  });

  it('warns when the other head is smaller and not a prefix of the local history', async () => {
    const log = new FakeLog(logKeys, leaves(6));
    const alice = await party('alice', log);
    const old = log.clone();
    old.leaves.length = 4;
    old.leaves[1] = { userId: 'u1', version: 1, identityKey: 'pub-evil', signingKey: 'sign-evil' };
    const bob = await party('bob', old);
    remember(alice);
    remember(bob);

    await deliver((await send(bob, alice)) as { from: string; envelope: string }, alice);
    expect(getActiveKtAlerts().map((alert) => alert.kind)).toEqual(['splitView']);
  });

  it('warns when the other head is larger than anything the local server ever signed', async () => {
    const log = new FakeLog(logKeys, leaves(5));
    const alice = await party('alice', log);
    const longer = log.clone();
    longer.append({ userId: 'x', version: 1, identityKey: 'pub-x', signingKey: '' });
    const bob = await party('bob', longer);
    remember(alice);
    remember(bob);

    await deliver((await send(bob, alice)) as { from: string; envelope: string }, alice);
    expect(getActiveKtAlerts().map((alert) => alert.kind)).toEqual(['splitView']);
  });

  it('stays silent when the local server cannot answer the consistency question', async () => {
    const log = new FakeLog(logKeys, leaves(5));
    const alice = await party('alice', log);
    const bob = await party('bob', log.clone());
    bob.log.append({ userId: 'x', version: 1, identityKey: 'pub-x', signingKey: '' });
    remember(alice, 5);
    remember(bob);
    alice.socket.server = (event, _payload, target) => {
      if (event === 'kt:get-consistency') {
        target.deliver('error', { event, code: 'internal.unexpected', message: 'x' });
      }
    };

    await deliver((await send(bob, alice)) as { from: string; envelope: string }, alice);
    expect(getActiveKtAlerts()).toEqual([]);
  });

  it('ignores heads signed by another log key', async () => {
    const log = new FakeLog(logKeys, leaves(5));
    const alice = await party('alice', log);
    const otherKeys = await newLogKeys();
    const bob = await party('bob', log.clone(otherKeys), otherKeys);
    remember(alice);
    remember(bob, 5, otherKeys);

    await deliver((await send(bob, alice)) as { from: string; envelope: string }, alice);
    expect(getActiveKtAlerts()).toEqual([]);
  });

  it('ignores envelopes that were tampered with, replayed to someone else or claimed by another sender', async () => {
    const log = new FakeLog(logKeys, leaves(5));
    const forked = log.clone();
    forked.leaves[2] = { userId: 'u2', version: 1, identityKey: 'pub-evil', signingKey: 'sign-evil' };
    const alice = await party('alice', log);
    const bob = await party('bob', forked);
    const carol = await party('carol', log.clone());
    remember(alice);
    remember(bob);
    remember(carol);
    const message = (await send(bob, alice)) as { from: string; envelope: string };

    const sodium = await getSodium();
    const bytes = sodium.from_base64(message.envelope);
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] as number) ^ 1;
    await deliver({ from: 'bob', envelope: sodium.to_base64(bytes) }, alice);
    await deliver(message, carol);
    await deliver({ from: 'carol', envelope: message.envelope }, alice);
    await deliver({ from: 'bob', envelope: 'not an envelope' }, alice);
    await deliver({ from: 'bob', envelope: 'A'.repeat(4000) }, alice);

    expect(getActiveKtAlerts()).toEqual([]);
  });

  it('ignores contacts whose key is unusable and unknown senders', async () => {
    const log = new FakeLog(logKeys, leaves(5));
    const forked = log.clone();
    forked.leaves[2] = { userId: 'u2', version: 1, identityKey: 'pub-evil', signingKey: 'sign-evil' };
    const alice = await party('alice', log);
    const bob = await party('bob', forked);
    remember(alice);
    remember(bob);
    const message = (await send(bob, alice)) as { from: string; envelope: string };

    directory.status.set('bob', 'changed');
    await deliver(message, alice);
    directory.keys.delete('bob');
    await deliver(message, alice);

    expect(getActiveKtAlerts()).toEqual([]);
  });

  it('is rate limited per contact and replies at most once', async () => {
    const log = new FakeLog(logKeys, leaves(5));
    const alice = await party('alice', log);
    const bob = await party('bob', log.clone());
    remember(alice);
    remember(bob);

    expect(await send(alice, bob)).not.toBeNull();
    expect(await send(alice, bob)).toBeNull();
    actAs(alice);
    expect(await gossipLatestHead(alice.socket.asSocket(), Date.now() + 11 * 60 * 1000)).toBe(1);
  });

  it('replies to a received head once, without ping-pong', async () => {
    const log = new FakeLog(logKeys, leaves(5));
    const alice = await party('alice', log);
    const bob = await party('bob', log.clone());
    remember(alice);
    remember(bob);

    const first = (await send(alice, bob)) as { from: string; envelope: string };
    await deliver(first, bob);
    expect(bob.socket.count('kt:gossip')).toBe(1);
    const reply = bob.socket.sent.find((entry) => entry.event === 'kt:gossip');
    expect(reply?.payload.to).toBe('alice');
    await deliver({ from: 'bob', envelope: reply?.payload.envelope as string }, alice);
    expect(alice.socket.count('kt:gossip')).toBe(1);
  });

  it('sends nothing without a verified head, without transparency or to unusable contacts', async () => {
    const log = new FakeLog(logKeys, leaves(5));
    const alice = await party('alice', log);
    const bob = await party('bob', log.clone());
    expect(await send(alice, bob)).toBeNull();
    remember(alice);
    directory.status.set('bob', 'invalid');
    expect(await send(alice, bob)).toBeNull();
    directory.status.set('bob', 'verified');
    setKtSocketConfig(alice.socket.asSocket(), null);
    expect(await send(alice, bob)).toBeNull();
  });

  it('processes at most one message per sender every 30 seconds', async () => {
    const log = new FakeLog(logKeys, leaves(5));
    const forked = log.clone();
    forked.leaves[2] = { userId: 'u2', version: 1, identityKey: 'pub-evil', signingKey: 'sign-evil' };
    const alice = await party('alice', log);
    const bob = await party('bob', forked);
    remember(alice);
    remember(bob);
    const message = (await send(bob, alice)) as { from: string; envelope: string };
    actAs(alice);
    const start = Date.now();

    await handleGossip(alice.socket.asSocket(), message, start);
    expect(alice.socket.count('kt:get-consistency')).toBe(0);
    const before = alice.socket.sent.length;
    await handleGossip(alice.socket.asSocket(), message, start + 1000);
    await handleGossip(alice.socket.asSocket(), message, start + 29_000);
    expect(alice.socket.sent.length).toBe(before);
    expect(getActiveKtAlerts().map((alert) => alert.kind)).toEqual(['splitView']);
  });

  describe('audited version exchange', () => {
    function accept(owner: string, sender: string, version: number, keys: { publicKey: string; signingKey: string }, at: number = Date.now()): void {
      const state = loadOwnerState(owner);
      saveOwnerState(owner, { ...state, contacts: { ...state.contacts, [sender]: { version, ...keys, leafHash: 'x', at } } });
    }

    async function rigAudit(audit: { version: number; publicKey: string; signingPublicKey: string | null } | null) {
      const log = new FakeLog(logKeys, leaves(5));
      const alice = await party('alice', log);
      const bob = await party('bob', log.clone());
      remember(alice);
      remember(bob);
      if (audit) {
        saveOwnerState('bob', { ...loadOwnerState('bob'), ownAudit: { ...audit, at: Date.now() } });
      }
      const message = (await send(bob, alice)) as { from: string; envelope: string };
      return { alice, message };
    }

    it('stays quiet when the audited keys match what the receiver accepted', async () => {
      const { alice, message } = await rigAudit({ version: 2, publicKey: 'pub-b', signingPublicKey: 'sign-b' });
      accept('alice', 'bob', 2, { publicKey: 'pub-b', signingKey: 'sign-b' }, Date.now());
      await deliver(message, alice);
      expect(getActiveKtAlerts()).toEqual([]);
    });

    it('warns when the sender audited other keys for the same version the receiver accepted', async () => {
      const { alice, message } = await rigAudit({ version: 2, publicKey: 'pub-b', signingPublicKey: 'sign-b' });
      accept('alice', 'bob', 2, { publicKey: 'pub-evil', signingKey: 'sign-evil' }, Date.now());
      await deliver(message, alice);
      expect(getActiveKtAlerts().map((alert) => alert.kind)).toEqual(['splitView']);
    });

    it('never alerts from the age of an audit, even when the sender clock is far ahead and its audit is old', async () => {
      const { alice, message } = await rigAudit({ version: 1, publicKey: 'pub-b', signingPublicKey: null });
      accept('alice', 'bob', 2, { publicKey: 'pub-b', signingKey: 'sign-b' }, Date.now() - 24 * 60 * 60 * 1000);
      await deliver(message, alice);
      expect(getActiveKtAlerts()).toEqual([]);
    });

    it('does not warn when the receiver has not accepted anything from the sender or the sender has no audit', async () => {
      const first = await rigAudit({ version: 2, publicKey: 'pub-b', signingPublicKey: null });
      await deliver(first.message, first.alice);
      expect(getActiveKtAlerts()).toEqual([]);
    });

    it('ignores malformed audits', () => {
      for (const audit of [
        null,
        { version: 0, publicKey: 'x', signingPublicKey: null },
        { version: 1.5, publicKey: 'x', signingPublicKey: null },
        { version: 1, publicKey: '', signingPublicKey: null },
        { version: 1, publicKey: 'x'.repeat(300), signingPublicKey: null },
        { version: 1, publicKey: 'x', signingPublicKey: 5 },
      ]) {
        expect(readAudit(audit)).toBeNull();
      }
      expect(readAudit({ version: 1, publicKey: 'x', signingPublicKey: null })).toEqual({ version: 1, publicKey: 'x', signingPublicKey: null });
    });
  });

  describe('envelopes that cannot be opened with the pinned key', () => {
    async function forgedEnvelope(alice: Party, bob: Party): Promise<{ from: string; envelope: string }> {
      const sodium = await getSodium();
      const impostor = sodium.crypto_box_keypair();
      const nonce = sodium.randombytes_buf(24);
      const box = sodium.crypto_box_easy(sodium.from_string('payload'), nonce, sodium.from_base64(alice.identity.publicKey), impostor.privateKey);
      const bytes = new Uint8Array(nonce.length + box.length);
      bytes.set(nonce, 0);
      bytes.set(box, nonce.length);
      return { from: bob.id, envelope: sodium.to_base64(bytes) };
    }

    it('raises one rate limited alert after repeated failures from an accepted contact', async () => {
      const log = new FakeLog(logKeys, leaves(5));
      const alice = await party('alice', log);
      const bob = await party('bob', log.clone());
      remember(alice);
      actAs(alice);
      const message = await forgedEnvelope(alice, bob);
      const start = Date.now();

      await handleGossip(alice.socket.asSocket(), message, start);
      await handleGossip(alice.socket.asSocket(), message, start + 31_000);
      expect(getActiveKtAlerts()).toEqual([]);
      await handleGossip(alice.socket.asSocket(), message, start + 62_000);
      await handleGossip(alice.socket.asSocket(), message, start + 93_000);
      expect(getActiveKtAlerts().map((alert) => alert.kind)).toEqual(['gossipUnreadable']);
    });

    it('forgets earlier failures after a readable message', async () => {
      const log = new FakeLog(logKeys, leaves(5));
      const alice = await party('alice', log);
      const bob = await party('bob', log.clone());
      remember(alice);
      remember(bob);
      const bad = await forgedEnvelope(alice, bob);
      const start = Date.now();
      actAs(alice);
      await handleGossip(alice.socket.asSocket(), bad, start);
      await handleGossip(alice.socket.asSocket(), bad, start + 31_000);
      const good = (await send(bob, alice)) as { from: string; envelope: string };
      actAs(alice);
      await handleGossip(alice.socket.asSocket(), good, start + 62_000);
      await handleGossip(alice.socket.asSocket(), bad, start + 93_000);
      await handleGossip(alice.socket.asSocket(), bad, start + 124_000);
      expect(getActiveKtAlerts()).toEqual([]);
    });
  });

  it('keeps the envelope within the server limit', async () => {
    const log = new FakeLog(logKeys, leaves(5));
    const alice = await party('alice', log);
    const bob = await party('bob', log.clone());
    remember(alice);
    const message = (await send(alice, bob)) as { from: string; envelope: string };
    expect(message.envelope.length).toBeLessThanOrEqual(2048);
    expect(message.envelope).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
