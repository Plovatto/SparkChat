import { beforeAll, describe, expect, it } from 'vitest';
import { openRoster, sealRoster, type GroupRoster } from './group-invite';
import {
  ENFORCE_SIGNED_ROSTERS,
  evaluateSender,
  signRoster,
  verifyGroupRoster,
  verifyRosterSignature,
  ROTATION_STALL_MS,
  type PreviousGeneration,
  type RosterVerificationContext,
  type SenderGeneration,
} from './group-roster';
import { generateIdentity } from './identity';
import { deriveSigningKeyPair } from './signing';
import { getSodium } from './sodium';

interface Person {
  userId: string;
  signingPublicKey: string;
  signingPrivateKey: Uint8Array;
}

const ROOM = 'room-1';
const KEY_1 = 'AAAAAAAAAAAAAAAAAAAAAA';
const KEY_2 = 'BBBBBBBBBBBBBBBBBBBBBB';
const KEY_3 = 'CCCCCCCCCCCCCCCCCCCCCC';
const T0 = 1_800_000_000_000;

let alice: Person;
let bob: Person;
let carol: Person;
let mallory: Person;

async function person(userId: string): Promise<Person> {
  const sodium = await getSodium();
  const identity = await generateIdentity();
  const pair = await deriveSigningKeyPair(identity.privateKey);
  return { userId, signingPublicKey: sodium.to_base64(pair.publicKey), signingPrivateKey: pair.privateKey };
}

beforeAll(async () => {
  [alice, bob, carol, mallory] = await Promise.all([person('alice'), person('bob'), person('carol'), person('mallory')]);
});

function member(who: Person) {
  return { userId: who.userId, signingPublicKey: who.signingPublicKey };
}

function signAs(
  issuer: Person,
  fields: { keyId?: string; epoch?: number; prevKeyId?: string | null; members?: Person[]; admins?: string[]; issuedAt?: number } = {},
): Promise<GroupRoster> {
  return signRoster(
    {
      roomId: ROOM,
      keyId: fields.keyId ?? KEY_1,
      epoch: fields.epoch ?? 1,
      prevKeyId: fields.prevKeyId === undefined ? null : fields.prevKeyId,
      members: (fields.members ?? [alice, bob, carol]).map(member),
      admins: fields.admins ?? [alice.userId],
      issuedBy: issuer.userId,
      issuedAt: fields.issuedAt ?? T0,
    },
    issuer.signingPrivateKey,
  );
}

const keys = () => new Map([alice, bob, carol, mallory].map((p) => [p.userId, p.signingPublicKey]));

function context(overrides: Partial<RosterVerificationContext> = {}): RosterVerificationContext {
  const previous = overrides.previous ?? null;
  const derivedAnchor =
    previous?.signed && previous.roster
      ? { epoch: previous.roster.epoch, roster: previous.roster, admins: new Set(previous.roster.admins ?? []) }
      : null;
  return {
    roomId: ROOM,
    keyId: KEY_1,
    epoch: 1,
    envelopeSenderId: alice.userId,
    creatorId: null,
    previous: null,
    anchor: derivedAnchor,
    signedFromEpoch: null,
    signedIssuers: new Set<string>(),
    enforceSigned: false,
    currentMemberIds: new Set(['alice', 'bob', 'carol']),
    promotedAdmins: new Set<string>(),
    serverAdmins: new Set<string>(),
    stallElapsed: false,
    resolveSigningKey: (userId) => Promise.resolve(keys().get(userId) ?? null),
    now: T0 + 1000,
    ...overrides,
  };
}

async function signedPrevious(): Promise<PreviousGeneration> {
  return { keyId: KEY_1, roster: await signAs(alice), signed: true };
}

describe('signed roster signature', () => {
  it('verifies for its own room, key and signer', async () => {
    const roster = await signAs(alice);

    expect(await verifyRosterSignature(roster, ROOM, KEY_1, alice.signingPublicKey)).toBe(true);
  });

  it.each([
    ['another room', (roster: GroupRoster) => verifyRosterSignature(roster, 'room-2', KEY_1, alice.signingPublicKey)],
    ['another key id', (roster: GroupRoster) => verifyRosterSignature(roster, ROOM, KEY_2, alice.signingPublicKey)],
    ['another signer', (roster: GroupRoster) => verifyRosterSignature(roster, ROOM, KEY_1, mallory.signingPublicKey)],
  ])('does not verify under %s', async (_label, verify) => {
    expect(await verify(await signAs(alice))).toBe(false);
  });

  it('does not verify after any signed field is altered', async () => {
    const roster = await signAs(alice);
    const tampered: GroupRoster[] = [
      { ...roster, members: [...roster.members, member(mallory)] },
      { ...roster, members: roster.members.filter((m) => m.userId !== 'carol') },
      { ...roster, admins: ['alice', 'mallory'] },
      { ...roster, issuedBy: 'bob' },
      { ...roster, issuedAt: (roster.issuedAt ?? 0) + 1 },
      { ...roster, epoch: 2 },
      { ...roster, prevKeyId: KEY_3 },
    ];

    for (const candidate of tampered) {
      expect(await verifyRosterSignature(candidate, ROOM, KEY_1, alice.signingPublicKey)).toBe(false);
    }
  });

  it('survives the sealed round trip and stays readable by clients that only know the legacy fields', async () => {
    const sodium = await getSodium();
    const roomKey = sodium.randombytes_buf(32);
    const roster = await signAs(alice);

    const sealed = await sealRoster(roster, roomKey, ROOM, KEY_1);
    const opened = await openRoster(sealed, roomKey, ROOM, KEY_1, 1);

    expect(opened).toEqual(roster);
    expect(opened?.members).toEqual(roster.members);
    expect(await verifyRosterSignature(opened as GroupRoster, ROOM, KEY_1, alice.signingPublicKey)).toBe(true);
  });

  it('keeps legacy rosters free of signed fields', async () => {
    const sodium = await getSodium();
    const roomKey = sodium.randombytes_buf(32);
    const legacy: GroupRoster = { epoch: 1, members: [member(alice)] };

    const opened = await openRoster(await sealRoster(legacy, roomKey, ROOM, KEY_1), roomKey, ROOM, KEY_1, 1);

    expect(opened).toEqual(legacy);
    expect(opened).not.toHaveProperty('sig');
  });
});

describe('verifyGroupRoster', () => {
  it('accepts a signed first roster from the key sender', async () => {
    expect(await verifyGroupRoster(await signAs(alice), context())).toEqual({ ok: true, signed: true });
  });

  it('keeps accepting legacy unsigned rosters until a signed one has been seen', async () => {
    const legacy: GroupRoster = { epoch: 2, members: [member(alice), member(bob)] };

    expect(await verifyGroupRoster(legacy, context({ epoch: 2, keyId: KEY_2 }))).toEqual({ ok: true, signed: false });
    expect(await verifyGroupRoster(null, context({ epoch: 2, keyId: KEY_2 }))).toEqual({ ok: true, signed: false });
  });

  it('refuses a downgrade to an unsigned or missing roster from a sender that has signed before', async () => {
    const legacy: GroupRoster = { epoch: 3, members: [member(alice), member(bob)] };
    const guarded = context({ epoch: 3, keyId: KEY_3, signedFromEpoch: 2, signedIssuers: new Set(['alice']) });

    expect(await verifyGroupRoster(legacy, guarded)).toEqual({ ok: false, reason: 'downgrade' });
    expect(await verifyGroupRoster(null, guarded)).toEqual({ ok: false, reason: 'missing' });
  });

  it('keeps accepting unsigned rosters from older clients that never signed, until enforcement is switched on', async () => {
    const legacy: GroupRoster = { epoch: 3, members: [member(alice), member(bob)] };
    const mixed = context({ epoch: 3, keyId: KEY_3, signedFromEpoch: 2 });

    expect(await verifyGroupRoster(legacy, mixed)).toEqual({ ok: true, signed: false });
    expect(await verifyGroupRoster(legacy, { ...mixed, enforceSigned: true })).toEqual({ ok: false, reason: 'downgrade' });
    expect(ENFORCE_SIGNED_ROSTERS).toBe(false);
  });

  it('still accepts unsigned history from before the first signed roster', async () => {
    const legacy: GroupRoster = { epoch: 1, members: [member(alice)] };

    expect(await verifyGroupRoster(legacy, context({ signedFromEpoch: 2 }))).toEqual({ ok: true, signed: false });
  });

  it('rejects a first roster that was not issued by the room creator', async () => {
    const forged = await signAs(mallory, { members: [alice, bob, mallory], admins: ['mallory'] });

    expect(await verifyGroupRoster(forged, context({ creatorId: 'alice' }))).toEqual({ ok: false, reason: 'not-admin' });
    expect(await verifyGroupRoster(await signAs(alice), context({ creatorId: 'alice' }))).toEqual({ ok: true, signed: true });
  });

  it('accepts a roster delivered by another member that shares the key, since the issuer signature is what counts', async () => {
    const roster = await signAs(alice);

    expect(await verifyGroupRoster(roster, context({ envelopeSenderId: 'bob', creatorId: 'alice' }))).toEqual({ ok: true, signed: true });
  });

  it('rejects a roster whose signature was produced by a key other than the issuer pinned key', async () => {
    const claimsAlice = await signRoster(
      { roomId: ROOM, keyId: KEY_1, epoch: 1, prevKeyId: null, members: [member(alice), member(bob)], admins: ['alice'], issuedBy: 'alice', issuedAt: T0 },
      mallory.signingPrivateKey,
    );

    expect(await verifyGroupRoster(claimsAlice, context())).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('rejects an issuer whose roster entry or pin disagrees with the signing key', async () => {
    const roster = await signAs(alice);

    expect(await verifyGroupRoster(roster, context({ resolveSigningKey: () => Promise.resolve(mallory.signingPublicKey) }))).toEqual({
      ok: false,
      reason: 'unpinned-issuer',
    });
    expect(await verifyGroupRoster(roster, context({ resolveSigningKey: () => Promise.resolve(null) }))).toEqual({ ok: false, reason: 'unpinned-issuer' });
  });

  it('rejects a replayed roster from another generation presented as the new one', async () => {
    const old = await signAs(alice, { keyId: KEY_1, epoch: 1 });
    const previous = await signedPrevious();

    expect(await verifyGroupRoster(old, context({ keyId: KEY_2, epoch: 2, previous }))).toEqual({ ok: false, reason: 'epoch-mismatch' });
    const relabelled: GroupRoster = { ...old, epoch: 2, prevKeyId: KEY_1 };
    expect(await verifyGroupRoster(relabelled, context({ keyId: KEY_2, epoch: 2, previous }))).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('rejects a roster that does not chain to the previous generation', async () => {
    const previous = await signedPrevious();
    const unrelated = await signAs(alice, { keyId: KEY_2, epoch: 2, prevKeyId: KEY_3 });

    expect(await verifyGroupRoster(unrelated, context({ keyId: KEY_2, epoch: 2, previous }))).toEqual({ ok: false, reason: 'chain-mismatch' });
  });

  it('accepts an admin rotation that removes a member and records the removal in the new roster', async () => {
    const previous = await signedPrevious();
    const rotated = await signAs(alice, { keyId: KEY_2, epoch: 2, prevKeyId: KEY_1, members: [alice, bob] });

    const verdict = await verifyGroupRoster(rotated, context({ keyId: KEY_2, epoch: 2, previous, signedFromEpoch: 1, currentMemberIds: new Set(['alice', 'bob']) }));

    expect(verdict).toEqual({ ok: true, signed: true });
    expect(rotated.members.map((m) => m.userId)).not.toContain('carol');
  });

  it('rejects a rotation published by a non-admin while an admin is still in the group', async () => {
    const previous = await signedPrevious();
    const bobRotation = await signAs(bob, { keyId: KEY_2, epoch: 2, prevKeyId: KEY_1, members: [alice, bob], admins: ['alice'] });

    expect(
      await verifyGroupRoster(bobRotation, context({ keyId: KEY_2, epoch: 2, envelopeSenderId: 'bob', previous, signedFromEpoch: 1 })),
    ).toEqual({ ok: false, reason: 'not-admin' });
  });

  it('accepts a non-admin retry once the rotation stalled, as long as nobody is dropped or promoted', async () => {
    const previous = await signedPrevious();
    const retry = await signAs(bob, { keyId: KEY_2, epoch: 2, prevKeyId: KEY_1, members: [alice, bob, carol], admins: ['alice'] });
    const stalled = context({ keyId: KEY_2, epoch: 2, envelopeSenderId: 'bob', previous, signedFromEpoch: 1, stallElapsed: true });

    expect(await verifyGroupRoster(retry, stalled)).toEqual({ ok: true, signed: true });

    const dropping = await signAs(bob, { keyId: KEY_2, epoch: 2, prevKeyId: KEY_1, members: [alice, bob], admins: ['alice'] });
    expect(await verifyGroupRoster(dropping, stalled)).toEqual({ ok: false, reason: 'dropped-members' });

    const promoting = await signAs(bob, { keyId: KEY_2, epoch: 2, prevKeyId: KEY_1, members: [alice, bob, carol], admins: ['alice', 'bob'] });
    expect(await verifyGroupRoster(promoting, stalled)).toEqual({ ok: false, reason: 'escalation' });
  });

  it('accepts a rotation from an admin promoted after the previous roster was signed', async () => {
    const previous = await signedPrevious();
    const rotation = await signAs(bob, { keyId: KEY_2, epoch: 2, prevKeyId: KEY_1, members: [alice, bob], admins: ['alice', 'bob'] });
    const promoted = context({ keyId: KEY_2, epoch: 2, envelopeSenderId: 'bob', previous, signedFromEpoch: 1, currentMemberIds: new Set(['alice', 'bob']) });

    expect(await verifyGroupRoster(rotation, promoted)).toEqual({ ok: false, reason: 'not-admin' });
    expect(await verifyGroupRoster(rotation, { ...promoted, promotedAdmins: new Set(['bob']) })).toEqual({ ok: true, signed: true });
  });

  it('treats a server-declared admin that no signed roster attests as a constrained retry', async () => {
    const previous = await signedPrevious();
    const removal = await signAs(bob, { keyId: KEY_2, epoch: 2, prevKeyId: KEY_1, members: [alice, bob], admins: ['alice'] });
    const declared = context({
      keyId: KEY_2,
      epoch: 2,
      envelopeSenderId: 'bob',
      previous,
      signedFromEpoch: 1,
      currentMemberIds: new Set(['alice', 'bob']),
      serverAdmins: new Set(['bob']),
    });

    expect(await verifyGroupRoster(removal, declared)).toEqual({ ok: true, signed: true });
    const escalating = await signAs(bob, { keyId: KEY_2, epoch: 2, prevKeyId: KEY_1, members: [alice, bob], admins: ['alice', 'bob'] });
    expect(await verifyGroupRoster(escalating, declared)).toEqual({ ok: false, reason: 'escalation' });
    const dropping = await signAs(bob, { keyId: KEY_2, epoch: 2, prevKeyId: KEY_1, members: [alice, bob], admins: ['alice'] });
    expect(await verifyGroupRoster(dropping, { ...declared, currentMemberIds: new Set(['alice', 'bob', 'carol']) })).toEqual({ ok: false, reason: 'dropped-members' });
  });

  it('stops a stalled non-admin retry from adding people the room does not list', async () => {
    const previous = await signedPrevious();
    const padded = await signAs(bob, { keyId: KEY_2, epoch: 2, prevKeyId: KEY_1, members: [alice, bob, carol, mallory], admins: ['alice'] });

    expect(
      await verifyGroupRoster(padded, context({ keyId: KEY_2, epoch: 2, envelopeSenderId: 'bob', previous, signedFromEpoch: 1, stallElapsed: true })),
    ).toEqual({ ok: false, reason: 'added-members' });
  });

  it('keeps the authority anchored on the last signed roster across an unsigned generation', async () => {
    const anchored = await signedPrevious();
    const gap: PreviousGeneration = { keyId: KEY_2, roster: { epoch: 2, members: [member(alice), member(bob)] }, signed: false };
    const takeover = await signAs(bob, { keyId: KEY_3, epoch: 3, prevKeyId: KEY_2, members: [alice, bob], admins: ['bob'] });
    const chained = context({
      keyId: KEY_3,
      epoch: 3,
      envelopeSenderId: 'bob',
      previous: gap,
      anchor: { epoch: 1, roster: anchored.roster as GroupRoster, admins: new Set(['alice']) },
      signedFromEpoch: 1,
      currentMemberIds: new Set(['alice', 'bob']),
    });

    expect(await verifyGroupRoster(takeover, chained)).toEqual({ ok: false, reason: 'not-admin' });
    expect(await verifyGroupRoster(takeover, { ...chained, stallElapsed: true })).toEqual({ ok: false, reason: 'escalation' });
  });

  it('accepts an unsigned roster after a signed chain only from a signed admin', async () => {
    const anchored = await signedPrevious();
    const unsigned: GroupRoster = { epoch: 2, members: [member(alice), member(bob)] };
    const base = context({ keyId: KEY_2, epoch: 2, previous: anchored, signedFromEpoch: 1, currentMemberIds: new Set(['alice', 'bob']) });

    expect(await verifyGroupRoster(unsigned, { ...base, envelopeSenderId: 'alice' })).toEqual({ ok: true, signed: false });
    expect(await verifyGroupRoster(unsigned, { ...base, envelopeSenderId: 'bob' })).toEqual({ ok: false, reason: 'not-admin' });
  });

  it('stops a server that omits the admins from the member list from letting a restricted rotation drop them', async () => {
    const previous = await signedPrevious();
    const omitted = await signAs(bob, { keyId: KEY_2, epoch: 2, prevKeyId: KEY_1, members: [bob, carol], admins: [] });
    const lying = context({
      keyId: KEY_2,
      epoch: 2,
      envelopeSenderId: 'bob',
      previous,
      signedFromEpoch: 1,
      currentMemberIds: new Set(['bob', 'carol']),
      stallElapsed: true,
    });

    expect(await verifyGroupRoster(omitted, lying)).toEqual({ ok: false, reason: 'dropped-admins' });
    const takeover = await signAs(bob, { keyId: KEY_2, epoch: 2, prevKeyId: KEY_1, members: [bob, carol], admins: ['bob'] });
    expect(await verifyGroupRoster(takeover, lying)).toEqual({ ok: false, reason: 'escalation' });
  });

  it('stops a restricted rotation from emptying the admin list to trigger the adminless takeover', async () => {
    const previous = await signedPrevious();
    const emptied = await signAs(bob, { keyId: KEY_2, epoch: 2, prevKeyId: KEY_1, members: [alice, bob], admins: [] });
    const stalled = context({
      keyId: KEY_2,
      epoch: 2,
      envelopeSenderId: 'bob',
      previous,
      signedFromEpoch: 1,
      currentMemberIds: new Set(['alice', 'bob']),
      stallElapsed: true,
    });

    expect(await verifyGroupRoster(emptied, stalled)).toEqual({ ok: false, reason: 'dropped-admins' });
    const kept = await signAs(bob, { keyId: KEY_2, epoch: 2, prevKeyId: KEY_1, members: [alice, bob], admins: ['alice'] });
    expect(await verifyGroupRoster(kept, stalled)).toEqual({ ok: true, signed: true });
  });

  it('only opens the adminless takeover when every anchor admin has a verified later departure', async () => {
    const previous = await signedPrevious();
    const takeover = await signAs(bob, { keyId: KEY_2, epoch: 2, prevKeyId: KEY_1, members: [bob, carol], admins: ['bob'] });
    const away = context({
      keyId: KEY_2,
      epoch: 2,
      envelopeSenderId: 'bob',
      previous,
      signedFromEpoch: 1,
      currentMemberIds: new Set(['bob', 'carol']),
    });

    expect(await verifyGroupRoster(takeover, away)).toEqual({ ok: false, reason: 'not-admin' });
    expect(await verifyGroupRoster(takeover, { ...away, stallElapsed: true })).toEqual({ ok: false, reason: 'escalation' });
    const departed = { ...away, anchor: { epoch: 1, roster: previous.roster as GroupRoster, admins: new Set<string>() } };
    expect(await verifyGroupRoster(takeover, departed)).toEqual({ ok: true, signed: true });
  });

  it('lets a member take over when every previous admin is gone', async () => {
    const previous = await signedPrevious();
    const takeover = await signAs(bob, { keyId: KEY_2, epoch: 2, prevKeyId: KEY_1, members: [bob, carol], admins: ['bob'] });

    const verdict = await verifyGroupRoster(
      takeover,
      context({
        keyId: KEY_2,
        epoch: 2,
        envelopeSenderId: 'bob',
        previous,
        anchor: { epoch: 1, roster: previous.roster as GroupRoster, admins: new Set<string>() },
        signedFromEpoch: 1,
        currentMemberIds: new Set(['bob', 'carol']),
      }),
    );

    expect(verdict).toEqual({ ok: true, signed: true });
  });

  it('rejects an outsider that was not in the previous roster', async () => {
    const previous = await signedPrevious();
    const outsider = await signAs(mallory, { keyId: KEY_2, epoch: 2, prevKeyId: KEY_1, members: [alice, mallory], admins: ['mallory'] });

    expect(
      await verifyGroupRoster(outsider, context({ keyId: KEY_2, epoch: 2, envelopeSenderId: 'mallory', previous, signedFromEpoch: 1, stallElapsed: true })),
    ).toEqual({ ok: false, reason: 'not-admin' });
  });

  it('upgrades from a legacy previous roster only for issuers that were members of it', async () => {
    const legacyPrevious: PreviousGeneration = { keyId: KEY_1, roster: { epoch: 1, members: [member(alice), member(bob)] }, signed: false };
    const upgrade = await signAs(alice, { keyId: KEY_2, epoch: 2, prevKeyId: KEY_1, members: [alice, bob] });
    const intruder = await signAs(mallory, { keyId: KEY_2, epoch: 2, prevKeyId: KEY_1, members: [alice, mallory], admins: ['mallory'] });

    expect(await verifyGroupRoster(upgrade, context({ keyId: KEY_2, epoch: 2, previous: legacyPrevious }))).toEqual({ ok: true, signed: true });
    expect(await verifyGroupRoster(intruder, context({ keyId: KEY_2, epoch: 2, envelopeSenderId: 'mallory', previous: legacyPrevious }))).toEqual({
      ok: false,
      reason: 'not-admin',
    });
  });

  it('rejects malformed signed fields', async () => {
    const roster = await signAs(alice);
    const malformed: GroupRoster[] = [
      { ...roster, admins: ['ghost'] },
      { ...roster, members: [...roster.members, ...roster.members] },
      { ...roster, issuedAt: Number.NaN },
      { ...roster, v: 3 },
    ];

    for (const candidate of malformed) {
      expect(await verifyGroupRoster(candidate, context())).toEqual({ ok: false, reason: 'malformed' });
    }
  });

  it('exposes a stall window of two minutes shared with the API', () => {
    expect(ROTATION_STALL_MS).toBe(120_000);
  });
});

describe('evaluateSender', () => {
  async function generations(): Promise<SenderGeneration[]> {
    return [
      { epoch: 1, keyId: KEY_1, roster: await signAs(alice, { issuedAt: T0 }), signed: true },
      {
        epoch: 2,
        keyId: KEY_2,
        roster: await signAs(alice, { keyId: KEY_2, epoch: 2, prevKeyId: KEY_1, members: [alice, bob], issuedAt: T0 + 10_000 }),
        signed: true,
        acceptedAt: T0 + 12_000,
      },
    ];
  }

  const base = { keyId: KEY_1, isCurrentMember: true, live: false, now: T0 + 60_000 };

  it('accepts members listed in the latest roster whichever generation their message used', async () => {
    const list = await generations();

    expect(evaluateSender({ ...base, generations: list, senderId: 'bob', timestamp: T0 + 30_000 })).toBe('ok');
    expect(evaluateSender({ ...base, generations: list, keyId: KEY_2, senderId: 'alice', timestamp: T0 + 30_000 })).toBe('ok');
  });

  it('keeps a removed member earlier messages but drops anything sent under the old key after the rotation point', async () => {
    const list = await generations();

    expect(evaluateSender({ ...base, generations: list, senderId: 'carol', timestamp: T0 + 5000 })).toBe('ok');
    expect(evaluateSender({ ...base, generations: list, senderId: 'carol', timestamp: T0 + 10_000 })).toBe('after-removal');
    expect(evaluateSender({ ...base, generations: list, senderId: 'carol', timestamp: T0 + 50_000 })).toBe('after-removal');
  });

  it('judges a live message by the local arrival time so a backdated server timestamp does not help the removed member', async () => {
    const list = await generations();

    expect(evaluateSender({ ...base, generations: list, senderId: 'carol', timestamp: T0 + 1000, live: true })).toBe('after-removal');
  });

  it('never accepts a removed member under the new key either', async () => {
    const list = await generations();

    expect(evaluateSender({ ...base, generations: list, keyId: KEY_2, senderId: 'carol', timestamp: T0 + 50_000, isCurrentMember: false, live: true })).toBe(
      'not-member',
    );
  });

  it('accepts a joiner under the current key while the room lists them as a member and rejects a live stranger', async () => {
    const list = await generations();

    expect(evaluateSender({ ...base, generations: list, keyId: KEY_2, senderId: 'dave', timestamp: T0 + 50_000, live: true })).toBe('ok');
    expect(evaluateSender({ ...base, generations: list, keyId: KEY_2, senderId: 'dave', timestamp: T0 + 50_000, live: true, isCurrentMember: false })).toBe(
      'not-member',
    );
  });

  it('does nothing for rooms without a signed roster', () => {
    const legacy: SenderGeneration[] = [{ epoch: 1, keyId: KEY_1, roster: { epoch: 1, members: [member(alice)] }, signed: false }];

    expect(evaluateSender({ ...base, generations: legacy, senderId: 'carol', timestamp: T0 + 5000, live: true })).toBe('ok');
  });

  it('treats a verified signed removal as the cutoff before any rotation lands', async () => {
    const onlyFirst = [(await generations())[0] as SenderGeneration];

    const gone = { ...base, isCurrentMember: false };

    expect(evaluateSender({ ...gone, generations: onlyFirst, senderId: 'carol', timestamp: T0 + 20_000, removedAt: T0 + 15_000 })).toBe('after-removal');
    expect(evaluateSender({ ...gone, generations: onlyFirst, senderId: 'carol', timestamp: T0 + 10_000, removedAt: T0 + 15_000 })).toBe('ok');
    expect(evaluateSender({ ...base, generations: onlyFirst, senderId: 'carol', timestamp: T0 + 20_000, removedAt: T0 + 15_000 })).toBe('ok');
  });
});
