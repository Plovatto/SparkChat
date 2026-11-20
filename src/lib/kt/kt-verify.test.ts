import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCurrentIdentity } from '@lib/e2ee/current-identity';
import { generateIdentity } from '@lib/e2ee/identity';
import type { E2ePublicKeyEntry } from '@lib/socket';
import { getActiveKtAlerts, resetKtAlerts } from './kt-alerts';
import { KT_CONFIG_DEADLINE_MS, markKtAuthenticated, setKtBuildConfigForTests, setKtSocketConfig } from './kt-config';
import { acceptNewLogKey, retryCandidateHead } from './kt-head';
import { resetKtHealth } from './kt-health';
import { setKtRetryDelaysForTests } from './kt-rpc';
import { FakeLog, FakeSocket, logServer, memoryKtStorage, newLogKeys, type FakeLogKeys, type ServerBehavior } from './kt-test-support';
import { loadOwnerState } from './kt-store';
import { resetKtVerificationCache, verifyPublicKeyEntries } from './kt-verify';

const OWNER = 'owner-1';

function entry(userId: string, publicKey = `pub-${userId}`, signingPublicKey = `sign-${userId}`): E2ePublicKeyEntry {
  return { userId, publicKey, signingPublicKey, keySignature: 'sig' };
}

function seedLog(keys: FakeLogKeys, users: string[]): FakeLog {
  const log = new FakeLog(keys);
  for (const userId of users) {
    log.append({ userId, version: 1, identityKey: `pub-${userId}`, signingKey: `sign-${userId}` });
  }
  return log;
}

interface Setup {
  keys: FakeLogKeys;
  log: FakeLog;
  socket: FakeSocket;
  behavior: ServerBehavior;
}

async function setup(users: string[] = ['alice', 'bob', 'carol']): Promise<Setup> {
  const keys = await newLogKeys();
  const log = seedLog(keys, users);
  const socket = new FakeSocket();
  const behavior: ServerBehavior = { log };
  socket.server = logServer(behavior);
  setKtSocketConfig(socket.asSocket(), { logPublicKey: keys.publicKey });
  return { keys, log, socket, behavior };
}

beforeEach(async () => {
  memoryKtStorage();
  setKtBuildConfigForTests({ pinnedLogPublicKey: null, witnessUrl: null });
  resetKtVerificationCache();
  resetKtAlerts();
  resetKtHealth();
  setKtRetryDelaysForTests([]);
  const identity = await generateIdentity();
  setCurrentIdentity({ userId: OWNER, publicKey: identity.publicKey, privateKey: identity.privateKey });
});

afterEach(() => {
  setKtRetryDelaysForTests(null);
  setCurrentIdentity(null);
  setKtBuildConfigForTests(null);
});

describe('verifyPublicKeyEntries', () => {
  it('returns the entries untouched and sends nothing when transparency is off', async () => {
    const socket = new FakeSocket();
    const entries = [entry('alice')];
    expect(await verifyPublicKeyEntries(socket.asSocket(), entries)).toEqual(entries);
    expect(socket.sent).toEqual([]);
    expect(loadOwnerState(OWNER).logPublicKey).toBeNull();
  });

  it('returns the entries untouched while there is no identity', async () => {
    const { socket } = await setup();
    setCurrentIdentity(null);
    const entries = [entry('alice')];
    expect(await verifyPublicKeyEntries(socket.asSocket(), entries)).toEqual(entries);
    expect(socket.sent).toEqual([]);
  });

  it('accepts keys with valid inclusion proofs, pins the log key and stores the head', async () => {
    const { socket, keys, log } = await setup();
    const entries = [entry('alice'), entry('bob'), entry('carol')];

    expect(await verifyPublicKeyEntries(socket.asSocket(), entries)).toEqual(entries);

    const state = loadOwnerState(OWNER);
    expect(state.logPublicKey).toBe(keys.publicKey);
    expect(state.head).toEqual(log.head());
    expect(getActiveKtAlerts()).toEqual([]);
  });

  it('handles a one leaf log and an entry without a signing key', async () => {
    const keys = await newLogKeys();
    const log = new FakeLog(keys);
    log.append({ userId: 'solo', version: 1, identityKey: 'pub-solo', signingKey: '' });
    const socket = new FakeSocket();
    socket.server = logServer({ log });
    setKtSocketConfig(socket.asSocket(), { logPublicKey: keys.publicKey });
    const unsigned: E2ePublicKeyEntry = { userId: 'solo', publicKey: 'pub-solo' };

    expect(await verifyPublicKeyEntries(socket.asSocket(), [unsigned])).toEqual([unsigned]);
  });

  it('refuses a key that was swapped after logging', async () => {
    const { socket } = await setup();
    const swapped = entry('bob', 'pub-mallory');
    const result = await verifyPublicKeyEntries(socket.asSocket(), [entry('alice'), swapped]);

    expect(result.map((item) => item.userId)).toEqual(['alice']);
    expect(getActiveKtAlerts().map((alert) => [alert.kind, alert.dedupeKey])).toEqual([['keyRejected', 'key-rejected:bob']]);
  });

  it('refuses a swapped signing key', async () => {
    const { socket } = await setup();
    expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('bob', 'pub-bob', 'sign-mallory')])).toEqual([]);
  });

  it('refuses a key when the server claims a proof that does not verify', async () => {
    const { socket, behavior } = await setup();
    behavior.tamperProofs = (proofs) =>
      proofs.map((proof) => {
        const original = proof.proof as string[];
        return { ...proof, proof: [original[0]?.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')) ?? '', ...original.slice(1)] };
      });
    expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')])).toEqual([]);
  });

  it('refuses a proof borrowed from another leaf', async () => {
    const { socket, behavior, log } = await setup();
    behavior.tamperProofs = (proofs) => proofs.map((proof) => ({ ...proof, position: 0, proof: log.inclusion(0) }));
    const result = await verifyPublicKeyEntries(socket.asSocket(), [entry('alice'), entry('bob')]);
    expect(result.map((item) => item.userId)).toEqual(['alice']);
  });

  it('refuses a replayed version number', async () => {
    const { socket, behavior } = await setup();
    behavior.tamperProofs = (proofs) => proofs.map((proof) => ({ ...proof, version: 2 }));
    expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')])).toEqual([]);
  });

  it('refuses keys the log says it does not have', async () => {
    const { socket } = await setup(['alice']);
    expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('alice'), entry('dave')])).toEqual([entry('alice')]);
    expect(getActiveKtAlerts()[0]?.detail).toBe('not-logged');
  });

  it.each([
    ['proofs that are not an array', { proofs: 'nope' }],
    ['a proof with garbage hashes', { proofs: [{ userId: 'alice', found: true, position: 0, version: 1, proof: ['***'] }] }],
    ['a proof of the wrong type', { proofs: [{ userId: 'alice', found: true, position: 0, version: 1, proof: 'x' }] }],
    ['a huge proof', { proofs: [{ userId: 'alice', found: true, position: 0, version: 1, proof: Array.from({ length: 200 }, () => 'A'.repeat(43)) }] }],
    ['a negative position', { proofs: [{ userId: 'alice', found: true, position: -1, version: 1, proof: [] }] }],
    ['a fractional position', { proofs: [{ userId: 'alice', found: true, position: 0.5, version: 1, proof: [] }] }],
    ['a null entry', { proofs: [null] }],
  ])('refuses without throwing on %s', async (_name, override) => {
    const { socket, log } = await setup();
    const original = socket.server;
    socket.server = (event, payload, target) => {
      if (event !== 'kt:get-proofs') {
        original(event, payload, target);
        return;
      }
      target.deliver('kt:proofs', { requestId: payload.requestId, head: log.head(), ...override });
    };
    expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')])).toEqual([]);
  });

  it('refuses everything when the head is not signed by the pinned log key', async () => {
    const { socket, behavior, log } = await setup();
    await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')]);
    resetKtVerificationCache();
    const rogue = log.clone(await newLogKeys());
    behavior.headOverride = () => rogue.head();

    expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('bob')])).toEqual([]);
    expect(getActiveKtAlerts().map((alert) => alert.kind)).toEqual(['logKeyChanged']);
  });

  it('refuses everything and offers a re-pin when the advertised log key changed', async () => {
    const first = await setup();
    await verifyPublicKeyEntries(first.socket.asSocket(), [entry('alice')]);
    resetKtVerificationCache();

    const rotatedKeys = await newLogKeys();
    const rotated = first.log.clone(rotatedKeys);
    const socket = new FakeSocket();
    socket.server = logServer({ log: rotated });
    setKtSocketConfig(socket.asSocket(), { logPublicKey: rotatedKeys.publicKey });

    expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')])).toEqual([]);
    expect(socket.sent).toEqual([]);
    expect(getActiveKtAlerts()[0]).toMatchObject({ kind: 'logKeyChanged', detail: 'stored' });

    acceptNewLogKey(OWNER);
    expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')])).toEqual([entry('alice')]);
    expect(loadOwnerState(OWNER).logPublicKey).toBe(rotatedKeys.publicKey);
  });

  it('refuses everything when the build pins a different log key and cannot be re-pinned', async () => {
    const { socket } = await setup();
    const other = await newLogKeys();
    setKtBuildConfigForTests({ pinnedLogPublicKey: other.publicKey, witnessUrl: null });

    expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')])).toEqual([]);
    expect(getActiveKtAlerts()[0]).toMatchObject({ kind: 'logKeyChanged', detail: 'build' });
    acceptNewLogKey(OWNER);
    expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')])).toEqual([]);
  });

  it('accepts when the build pin matches', async () => {
    const { socket, keys } = await setup();
    setKtBuildConfigForTests({ pinnedLogPublicKey: keys.publicKey, witnessUrl: null });
    expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')])).toEqual([entry('alice')]);
  });

  describe('history', () => {
    it('advances the stored head after a verified consistency proof', async () => {
      const { socket, log } = await setup(['alice', 'bob']);
      await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')]);
      expect(loadOwnerState(OWNER).head?.size).toBe(2);

      log.append({ userId: 'carol', version: 1, identityKey: 'pub-carol', signingKey: 'sign-carol' });
      log.append({ userId: 'dave', version: 1, identityKey: 'pub-dave', signingKey: 'sign-dave' });
      expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('dave')])).toEqual([entry('dave')]);

      expect(loadOwnerState(OWNER).head).toEqual(log.head());
      expect(socket.count('kt:get-consistency')).toBe(1);
    });

    it('detects a rolled back log', async () => {
      const { socket, log, behavior } = await setup(['alice', 'bob', 'carol']);
      await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')]);
      resetKtVerificationCache();
      behavior.headOverride = () => log.head(2);

      expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')])).toEqual([]);
      expect(getActiveKtAlerts()[0]).toMatchObject({ kind: 'splitView' });
      expect(loadOwnerState(OWNER).head?.size).toBe(3);
    });

    it('detects a forked history of the same size', async () => {
      const { socket, log, behavior } = await setup(['alice', 'bob', 'carol']);
      await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')]);
      resetKtVerificationCache();
      const fork = log.clone();
      fork.leaves[1] = { userId: 'bob', version: 1, identityKey: 'pub-evil', signingKey: 'sign-evil' };
      behavior.log = fork;

      expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')])).toEqual([]);
      expect(getActiveKtAlerts()[0]).toMatchObject({ kind: 'splitView' });
    });

    it('detects a rewritten history behind a larger head', async () => {
      const { socket, log, behavior } = await setup(['alice', 'bob', 'carol']);
      await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')]);
      resetKtVerificationCache();
      const fork = log.clone();
      fork.leaves[0] = { userId: 'alice', version: 1, identityKey: 'pub-evil', signingKey: 'sign-evil' };
      fork.append({ userId: 'dave', version: 1, identityKey: 'pub-dave', signingKey: 'sign-dave' });
      fork.append({ userId: 'erin', version: 1, identityKey: 'pub-erin', signingKey: 'sign-erin' });
      behavior.log = fork;

      expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('dave')])).toEqual([]);
      expect(getActiveKtAlerts()[0]).toMatchObject({ kind: 'splitView' });
      expect(loadOwnerState(OWNER).head?.size).toBe(3);
    });

    it('rejects a forged consistency proof', async () => {
      const { socket, log, behavior } = await setup(['alice', 'bob']);
      await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')]);
      resetKtVerificationCache();
      log.append({ userId: 'carol', version: 1, identityKey: 'pub-carol', signingKey: 'sign-carol' });
      behavior.consistencyOverride = () => ['A'.repeat(43)];

      expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('carol')])).toEqual([]);
      expect(getActiveKtAlerts()[0]).toMatchObject({ kind: 'splitView' });
    });

    it('refuses the keys of a response whose consistency cannot be checked, keeps the candidate and recovers later', async () => {
      const { socket, log, behavior, keys } = await setup(['alice', 'bob']);
      await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')]);
      resetKtVerificationCache();
      log.append({ userId: 'carol', version: 1, identityKey: 'pub-carol', signingKey: 'sign-carol' });
      behavior.failEvents = new Set(['kt:get-consistency']);

      expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('carol')])).toEqual([]);
      expect(loadOwnerState(OWNER).head?.size).toBe(2);
      expect(loadOwnerState(OWNER).candidate?.size).toBe(3);

      behavior.failEvents = undefined;
      expect(await retryCandidateHead(socket.asSocket(), OWNER, keys.publicKey)).toBe('ok');
      expect(loadOwnerState(OWNER).head?.size).toBe(3);
      expect(loadOwnerState(OWNER).candidate).toBeNull();
      expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('carol')])).toEqual([entry('carol')]);
    });

    it('raises an alert when consistency stays unavailable while other events answer', async () => {
      const { socket, log, behavior } = await setup(['alice', 'bob']);
      await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')]);
      resetKtVerificationCache();
      log.append({ userId: 'carol', version: 1, identityKey: 'pub-carol', signingKey: 'sign-carol' });
      behavior.failEvents = new Set(['kt:get-consistency']);

      await verifyPublicKeyEntries(socket.asSocket(), [entry('carol')]);
      await verifyPublicKeyEntries(socket.asSocket(), [entry('carol')]);
      await verifyPublicKeyEntries(socket.asSocket(), [entry('carol')]);
      await verifyPublicKeyEntries(socket.asSocket(), [entry('carol')]);

      expect(getActiveKtAlerts().map((alert) => alert.kind)).toEqual(['logUnavailable']);
    });
  });

  describe('when the log does not answer', () => {
    it('refuses the keys instead of trusting them when the server answers with an error', async () => {
      const { socket, behavior } = await setup();
      behavior.failEvents = new Set(['kt:get-proofs']);
      const entries = [entry('alice'), entry('mallory-unlogged')];

      expect(await verifyPublicKeyEntries(socket.asSocket(), entries)).toEqual([]);
      expect(getActiveKtAlerts()).toEqual([]);
    });

    it('keeps refusing for an account that already uses the log and verifies them once the log answers', async () => {
      const { socket, behavior } = await setup();
      await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')]);
      resetKtVerificationCache();
      behavior.failEvents = new Set(['kt:get-proofs']);
      expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('bob')])).toEqual([]);

      behavior.failEvents = undefined;
      expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('bob')])).toEqual([entry('bob')]);
    });

    it('retries a failing request before giving up', async () => {
      setKtRetryDelaysForTests([0, 0]);
      const { socket, log } = await setup();
      let failures = 2;
      socket.server = (event, payload, target) => {
        if (event === 'kt:get-proofs' && failures > 0) {
          failures -= 1;
          target.deliver('error', { event, code: 'rateLimit.socket', message: 'x' });
          return;
        }
        logServer({ log })(event, payload, target);
      };

      expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')])).toEqual([entry('alice')]);
      expect(socket.count('kt:get-proofs')).toBe(3);
    });

    it('refuses the keys after a timeout', async () => {
      const { socket } = await setup();
      socket.server = () => undefined;
      vi.useFakeTimers();
      try {
        const pending = verifyPublicKeyEntries(socket.asSocket(), [entry('alice')]);
        await vi.advanceTimersByTimeAsync(8100);
        expect(await pending).toEqual([]);
      } finally {
        vi.useRealTimers();
      }
      expect(getActiveKtAlerts()).toEqual([]);
    });

    it('only trusts the keys while disconnected when the account never used the log', async () => {
      const { socket } = await setup();
      socket.connected = false;
      expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')])).toEqual([entry('alice')]);
      expect(socket.sent).toEqual([]);

      socket.connected = true;
      await verifyPublicKeyEntries(socket.asSocket(), [entry('bob')]);
      resetKtVerificationCache();
      socket.connected = false;
      expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')])).toEqual([]);
    });

    it('raises one alert when a single request keeps failing while the others answer', async () => {
      const { socket, behavior } = await setup();
      const { ktRequest } = await import('./kt-rpc');
      await ktRequest(socket.asSocket(), 'kt:get-head', 'kt:head', {});
      behavior.failEvents = new Set(['kt:get-proofs']);

      for (const name of ['alice', 'bob', 'carol', 'alice', 'bob']) {
        await verifyPublicKeyEntries(socket.asSocket(), [entry(name)]);
      }

      expect(getActiveKtAlerts().map((alert) => alert.kind)).toEqual(['logUnavailable']);
    });

    it('does not raise that alert when nothing answers at all', async () => {
      const { socket, behavior } = await setup();
      behavior.failEvents = new Set(['kt:get-proofs', 'kt:get-head']);
      for (const name of ['alice', 'bob', 'carol', 'alice', 'bob']) {
        await verifyPublicKeyEntries(socket.asSocket(), [entry(name)]);
      }
      expect(getActiveKtAlerts()).toEqual([]);
    });
  });

  describe('downgrade', () => {
    async function pinned(): Promise<Setup> {
      const rig = await setup();
      await verifyPublicKeyEntries(rig.socket.asSocket(), [entry('alice')]);
      resetKtVerificationCache();
      setKtSocketConfig(rig.socket.asSocket(), null);
      return rig;
    }

    it('alerts when a pinned account no longer gets the configuration, and keeps working without a build pin', async () => {
      const { socket } = await pinned();
      expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('bob')])).toEqual([entry('bob')]);
      expect(getActiveKtAlerts().map((alert) => alert.kind)).toEqual(['downgrade']);
    });

    it('refuses new or changed keys when the build pins the log and the configuration is gone', async () => {
      const { socket, keys } = await pinned();
      setKtBuildConfigForTests({ pinnedLogPublicKey: keys.publicKey, witnessUrl: null });
      expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('alice'), entry('bob'), entry('alice', 'pub-mallory')])).toEqual([entry('alice')]);
      expect(getActiveKtAlerts().map((alert) => alert.kind)).toEqual(['downgrade']);
    });

    it('stays quiet for an account that never used the log', async () => {
      const socket = new FakeSocket();
      expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')])).toEqual([entry('alice')]);
      expect(getActiveKtAlerts()).toEqual([]);
    });

    it('waits for a configuration that is about to arrive instead of alerting', async () => {
      const { socket, keys } = await pinned();
      markKtAuthenticated(socket.asSocket());
      setTimeout(() => setKtSocketConfig(socket.asSocket(), { logPublicKey: keys.publicKey }), 40);

      expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('bob')])).toEqual([entry('bob')]);
      expect(getActiveKtAlerts()).toEqual([]);
    });

    it('alerts once the deadline passes without a configuration', async () => {
      const { socket } = await pinned();
      markKtAuthenticated(socket.asSocket(), Date.now() - KT_CONFIG_DEADLINE_MS - 1);
      expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('bob')])).toEqual([entry('bob')]);
      expect(getActiveKtAlerts().map((alert) => alert.kind)).toEqual(['downgrade']);
    });
  });

  describe('contact version tracking', () => {
    function twoVersions(keys: FakeLogKeys): FakeLog {
      const log = new FakeLog(keys);
      log.append({ userId: 'alice', version: 1, identityKey: 'pub-alice', signingKey: '' });
      log.append({ userId: 'alice', version: 2, identityKey: 'pub-alice', signingKey: 'sign-alice' });
      return log;
    }

    function rig(log: FakeLog, keys: FakeLogKeys): FakeSocket {
      const socket = new FakeSocket();
      socket.server = logServer({ log });
      setKtSocketConfig(socket.asSocket(), { logPublicKey: keys.publicKey });
      return socket;
    }

    it('stores the highest accepted version of every contact', async () => {
      const keys = await newLogKeys();
      const socket = rig(twoVersions(keys), keys);
      await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')]);
      expect(loadOwnerState(OWNER).contacts.alice).toMatchObject({ version: 2, publicKey: 'pub-alice', signingKey: 'sign-alice' });
    });

    it('rejects an older version once a newer one was accepted', async () => {
      const keys = await newLogKeys();
      const socket = rig(twoVersions(keys), keys);
      await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')]);
      resetKtVerificationCache();

      const older: E2ePublicKeyEntry = { userId: 'alice', publicKey: 'pub-alice' };
      expect(await verifyPublicKeyEntries(socket.asSocket(), [older])).toEqual([]);
      expect(getActiveKtAlerts()[0]).toMatchObject({ kind: 'keyRejected', detail: 'version-regression' });
      expect(loadOwnerState(OWNER).contacts.alice?.version).toBe(2);
    });

    it('rejects a repeated version carrying different keys', async () => {
      const keys = await newLogKeys();
      const log = twoVersions(keys);
      log.append({ userId: 'alice', version: 2, identityKey: 'pub-evil', signingKey: 'sign-evil' });
      const socket = rig(log, keys);

      expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')])).toEqual([entry('alice')]);
      resetKtVerificationCache();
      expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('alice', 'pub-evil', 'sign-evil')])).toEqual([]);
      expect(getActiveKtAlerts()[0]).toMatchObject({ kind: 'keyRejected', detail: 'version-conflict' });
    });

    it('accepts a newer version and moves the record forward', async () => {
      const keys = await newLogKeys();
      const log = new FakeLog(keys);
      log.append({ userId: 'alice', version: 1, identityKey: 'pub-alice', signingKey: '' });
      const socket = rig(log, keys);
      await verifyPublicKeyEntries(socket.asSocket(), [{ userId: 'alice', publicKey: 'pub-alice' }]);
      log.append({ userId: 'alice', version: 2, identityKey: 'pub-alice', signingKey: 'sign-alice' });
      resetKtVerificationCache();

      expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')])).toEqual([entry('alice')]);
      expect(loadOwnerState(OWNER).contacts.alice?.version).toBe(2);
    });
  });

  describe('batching and caching', () => {
    it('splits large lookups into requests of at most 50 keys', async () => {
      const users = Array.from({ length: 120 }, (_, i) => `user-${i}`);
      const { socket } = await setup(users);
      const entries = users.map((userId) => entry(userId));

      expect(await verifyPublicKeyEntries(socket.asSocket(), entries)).toEqual(entries);
      expect(socket.count('kt:get-proofs')).toBe(3);
      for (const sent of socket.sent.filter((item) => item.event === 'kt:get-proofs')) {
        expect((sent.payload.items as unknown[]).length).toBeLessThanOrEqual(50);
      }
    });

    it('does not ask again for keys that were just verified', async () => {
      const { socket } = await setup();
      await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')]);
      await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')]);
      expect(socket.count('kt:get-proofs')).toBe(1);
    });

    it('never trusts a cached verification for different key material', async () => {
      const { socket } = await setup();
      await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')]);
      expect(await verifyPublicKeyEntries(socket.asSocket(), [entry('alice', 'pub-mallory')])).toEqual([]);
    });

    it('keeps state per account', async () => {
      const { socket, keys } = await setup();
      await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')]);
      const identity = await generateIdentity();
      setCurrentIdentity({ userId: 'other-owner', publicKey: identity.publicKey, privateKey: identity.privateKey });
      expect(loadOwnerState('other-owner').logPublicKey).toBeNull();
      await verifyPublicKeyEntries(socket.asSocket(), [entry('alice')]);
      expect(loadOwnerState('other-owner').logPublicKey).toBe(keys.publicKey);
      expect(socket.count('kt:get-proofs')).toBe(2);
    });
  });
});
