import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContactPin } from './key-store';

const pins = vi.hoisted(() => new Map<string, ContactPin>());

vi.mock('@lib/i18n/app-i18n', () => ({ translate: (key: string) => key }));

vi.mock('./key-store', () => ({
  saveRoomKeyGeneration: () => Promise.resolve(),
  loadRoomKeyGenerations: () => Promise.resolve([]),
  clearRoomKeyStore: () => Promise.resolve(),
  contactPinId: (ownerId: string, contactId: string) => `${ownerId}:${contactId}`,
  loadContactPin: (ownerId: string, contactId: string) => Promise.resolve(pins.get(`${ownerId}:${contactId}`) ?? null),
  saveContactPin: (pin: ContactPin) => {
    pins.set(pin.id, pin);
    return Promise.resolve();
  },
}));

import { getActiveKtAlerts, resetKtAlerts } from '@lib/kt/kt-alerts';
import { setKtBuildConfigForTests, setKtSocketConfig } from '@lib/kt/kt-config';
import { resetKtVerificationCache } from '@lib/kt/kt-verify';
import { FakeLog, FakeSocket, logServer, memoryKtStorage, newLogKeys, type ServerBehavior } from '@lib/kt/kt-test-support';
import { resetContactTrustState } from './contact-trust';
import { setCurrentIdentity } from './current-identity';
import { generateIdentity } from './identity';
import { lookupContactKey } from './room-keys';
import { buildSigningProof } from './signing';

interface Directory {
  userId: string;
  publicKey: string;
  signingPublicKey: string;
  keySignature: string;
}

async function contact(userId: string): Promise<Directory> {
  const identity = await generateIdentity();
  const proof = await buildSigningProof(userId, identity.publicKey, identity.privateKey);
  return { userId, publicKey: identity.publicKey, ...proof };
}

interface Rig {
  socket: FakeSocket;
  bob: Directory;
  mallory: Directory;
  served: { entry: Directory };
  behavior: ServerBehavior;
  log: FakeLog;
}

async function rig(options: { transparency: boolean }): Promise<Rig> {
  const bob = await contact('bob');
  const mallory = await contact('bob');
  const keys = await newLogKeys();
  const log = new FakeLog(keys, [
    { userId: 'ana', version: 1, identityKey: 'pub-ana', signingKey: '' },
    { userId: 'bob', version: 1, identityKey: bob.publicKey, signingKey: bob.signingPublicKey },
  ]);
  const behavior: ServerBehavior = { log };
  const kt = logServer(behavior);
  const served = { entry: bob };
  const socket = new FakeSocket();
  socket.server = (event, payload, target) => {
    if (event === 'e2e:get-public-keys') {
      queueMicrotask(() => target.deliver('e2e:public-keys', { keys: [served.entry] }));
      return;
    }
    kt(event, payload, target);
  };
  if (options.transparency) {
    setKtSocketConfig(socket.asSocket(), { logPublicKey: keys.publicKey });
  }
  return { socket, bob, mallory, served, behavior, log };
}

beforeEach(async () => {
  pins.clear();
  memoryKtStorage();
  setKtBuildConfigForTests({ pinnedLogPublicKey: null, witnessUrl: null });
  resetKtAlerts();
  resetKtVerificationCache();
  resetContactTrustState();
  const me = await generateIdentity();
  setCurrentIdentity({ userId: 'ana', publicKey: me.publicKey, privateKey: me.privateKey });
  vi.stubGlobal('window', globalThis);
});

afterEach(() => {
  setCurrentIdentity(null);
  setKtBuildConfigForTests(null);
  vi.unstubAllGlobals();
});

describe('contact key lookups with key transparency', () => {
  it('behaves exactly like before when the feature is off', async () => {
    const { socket, bob } = await rig({ transparency: false });
    const trust = await lookupContactKey(socket.asSocket(), 'bob');
    expect(trust?.pin?.publicKey).toBe(bob.publicKey);
    expect(socket.sent.map((entry) => entry.event)).toEqual(['e2e:get-public-keys']);
  });

  it('pins a key that has a valid inclusion proof', async () => {
    const { socket, bob } = await rig({ transparency: true });
    const trust = await lookupContactKey(socket.asSocket(), 'bob');
    expect(trust?.pin?.publicKey).toBe(bob.publicKey);
    expect(trust?.status).toBe('unverified');
    expect(socket.sent.map((entry) => entry.event)).toContain('kt:get-proofs');
  });

  it('refuses a key the server swapped for another one that was never logged', async () => {
    const { socket, served, mallory } = await rig({ transparency: true });
    served.entry = mallory;

    expect(await lookupContactKey(socket.asSocket(), 'bob')).toBeNull();
    expect(pins.size).toBe(0);
    expect(getActiveKtAlerts().map((alert) => alert.kind)).toEqual(['keyRejected']);
  });

  it('refuses a swapped key even when the server forges a proof for it', async () => {
    const { socket, served, mallory, behavior } = await rig({ transparency: true });
    served.entry = mallory;
    behavior.tamperProofs = (proofs) => proofs.map((proof) => ({ ...proof, found: true, position: 1, version: 1, proof: behavior.log.inclusion(1) }));

    expect(await lookupContactKey(socket.asSocket(), 'bob')).toBeNull();
    expect(pins.size).toBe(0);
  });

  it('keeps working when the log is unreachable', async () => {
    const { socket, bob, behavior } = await rig({ transparency: true });
    behavior.failEvents = new Set(['kt:get-proofs']);

    const trust = await lookupContactKey(socket.asSocket(), 'bob');
    expect(trust?.pin?.publicKey).toBe(bob.publicKey);
    expect(getActiveKtAlerts()).toEqual([]);
  });

  it('does not touch contacts whose keys are not served at all', async () => {
    const { socket, served } = await rig({ transparency: true });
    served.entry = { ...served.entry, userId: 'someone-else' };
    expect(await lookupContactKey(socket.asSocket(), 'bob')).toBeNull();
    expect(socket.count('kt:get-proofs')).toBe(0);
  });
});
