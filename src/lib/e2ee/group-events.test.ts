import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  eventIdentity,
  nextEventCounter,
  parseGroupEventAttestation,
  resetEventCounters,
  signGroupEvent,
  verifyGroupEvent,
  type GroupEventFields,
} from './group-events';
import { generateIdentity } from './identity';
import { deriveSigningKeyPair } from './signing';
import { getSodium } from './sodium';

let alice: { signingPublicKey: string; signingPrivateKey: Uint8Array };
let mallory: { signingPublicKey: string; signingPrivateKey: Uint8Array };

async function signer() {
  const sodium = await getSodium();
  const identity = await generateIdentity();
  const pair = await deriveSigningKeyPair(identity.privateKey);
  return { signingPublicKey: sodium.to_base64(pair.publicKey), signingPrivateKey: pair.privateKey };
}

beforeAll(async () => {
  alice = await signer();
  mallory = await signer();
});

beforeEach(() => {
  resetEventCounters();
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const fields: GroupEventFields = { roomId: 'room-1', epoch: 4, type: 'group.memberRemoved', actorId: 'alice', targetId: 'carol', counter: 1_800_000_000_000 };

describe('group event attestations', () => {
  it('signs and verifies an event for its actor key', async () => {
    const raw = await signGroupEvent(fields, alice.signingPrivateKey);
    const parsed = parseGroupEventAttestation(raw);

    expect(parsed).toMatchObject(fields);
    expect(await verifyGroupEvent(parsed!, alice.signingPublicKey)).toBe(true);
    expect(parsed?.sig).toMatch(/^[A-Za-z0-9_-]{86}$/);
  });

  it('does not verify under another key', async () => {
    const parsed = parseGroupEventAttestation(await signGroupEvent(fields, alice.signingPrivateKey));

    expect(await verifyGroupEvent(parsed!, mallory.signingPublicKey)).toBe(false);
  });

  it.each([
    ['room', { roomId: 'room-2' }],
    ['generation', { epoch: 5 }],
    ['event type', { type: 'group.adminPromoted' as const }],
    ['actor', { actorId: 'mallory' }],
    ['target', { targetId: 'bob' }],
    ['removed target', { targetId: null }],
    ['counter', { counter: 1 }],
  ])('does not verify when the %s is altered', async (_label, change) => {
    const parsed = parseGroupEventAttestation(await signGroupEvent(fields, alice.signingPrivateKey))!;

    expect(await verifyGroupEvent({ ...parsed, ...change }, alice.signingPublicKey)).toBe(false);
  });

  it('refuses malformed attestations', () => {
    const base = { v: 1, roomId: 'r', epoch: 1, type: 'group.memberLeft', actorId: 'a', targetId: null, counter: 1, sig: 'x' };
    const malformed: unknown[] = [
      undefined,
      null,
      '',
      'not json',
      '[]',
      JSON.stringify({ ...base, v: 2 }),
      JSON.stringify({ ...base, type: 'group.created' }),
      JSON.stringify({ ...base, epoch: -1 }),
      JSON.stringify({ ...base, epoch: 1.5 }),
      JSON.stringify({ ...base, counter: '1' }),
      JSON.stringify({ ...base, targetId: 3 }),
      JSON.stringify({ ...base, sig: 5 }),
      'x'.repeat(2000),
    ];

    for (const candidate of malformed) {
      expect(parseGroupEventAttestation(candidate)).toBeNull();
    }
    expect(parseGroupEventAttestation(JSON.stringify(base))).not.toBeNull();
  });

  it('identifies an event independently of its signature so replays collide', async () => {
    const first = parseGroupEventAttestation(await signGroupEvent(fields, alice.signingPrivateKey))!;
    const second = parseGroupEventAttestation(await signGroupEvent({ ...fields, counter: fields.counter + 1 }, alice.signingPrivateKey))!;

    expect(eventIdentity(first)).toBe(eventIdentity(first));
    expect(eventIdentity(first)).not.toBe(eventIdentity(second));
  });
});

describe('event counter', () => {
  it('is strictly increasing even when the clock stands still or goes back', () => {
    const a = nextEventCounter('room-1', 'alice', 1000);
    const b = nextEventCounter('room-1', 'alice', 1000);
    const c = nextEventCounter('room-1', 'alice', 500);

    expect(b).toBe(a + 1);
    expect(c).toBe(b + 1);
  });

  it('keeps its high-water mark across reloads and separates rooms and actors', () => {
    const first = nextEventCounter('room-1', 'alice', 5000);
    resetEventCounters();

    expect(nextEventCounter('room-1', 'alice', 10)).toBe(first + 1);
    expect(nextEventCounter('room-2', 'alice', 10)).toBe(10);
    expect(nextEventCounter('room-1', 'bob', 10)).toBe(10);
  });

  it('keeps working when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });

    expect(nextEventCounter('room-1', 'zed', 100)).toBe(100);
    expect(nextEventCounter('room-1', 'zed', 100)).toBe(101);
  });
});
