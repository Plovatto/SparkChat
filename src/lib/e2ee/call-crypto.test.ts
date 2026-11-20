import { describe, expect, it } from 'vitest';
import {
  CALL_TIMESTAMP_SKEW_MS,
  MAX_SIGNAL_WIRE_LENGTH,
  SignalChannel,
  createAcceptEnvelope,
  createInviteEnvelope,
  createTransferAcceptEnvelope,
  createTransferEnvelope,
  deriveSessionKeys,
  generateEphemeralKeyPair,
  newCallId,
  newDeviceId,
  openAcceptEnvelope,
  openInviteEnvelope,
  openTransferAcceptEnvelope,
  openTransferEnvelope,
  zeroEphemeralKeyPair,
  type PinnedPeer,
} from './call-crypto';
import type { CurrentIdentity } from './current-identity';
import { generateIdentity } from './identity';
import { buildSigningProof } from './signing';

interface Party {
  identity: CurrentIdentity;
  pinned: PinnedPeer;
}

async function party(userId: string): Promise<Party> {
  const keys = await generateIdentity();
  const proof = await buildSigningProof(userId, keys.publicKey, keys.privateKey);
  return {
    identity: { userId, publicKey: keys.publicKey, privateKey: keys.privateKey },
    pinned: { publicKey: keys.publicKey, signingPublicKey: proof.signingPublicKey },
  };
}

async function invite(caller: Party, callee: Party, overrides: { now?: number; roomId?: string; callId?: string } = {}) {
  const ekA = await generateEphemeralKeyPair();
  const callId = overrides.callId ?? (await newCallId());
  const envelope = await createInviteEnvelope({
    identity: caller.identity,
    calleePublicKey: callee.pinned.publicKey,
    callId,
    roomId: overrides.roomId ?? 'room-1',
    kind: 'video',
    calleeId: callee.identity.userId,
    ekA: ekA.publicKey,
    ...(overrides.now === undefined ? {} : { now: overrides.now }),
  });
  return { envelope, callId, ekA };
}

function openInvite(callee: Party, caller: Party, envelope: unknown, extra: { known?: Set<string>; now?: number; callerId?: string; roomId?: string } = {}) {
  return openInviteEnvelope({
    identity: callee.identity,
    caller: caller.pinned,
    claimedCallerId: extra.callerId ?? caller.identity.userId,
    claimedRoomId: extra.roomId ?? 'room-1',
    claimedKind: 'video',
    envelope,
    knownCallIds: extra.known ?? new Set(),
    ...(extra.now === undefined ? {} : { now: extra.now }),
  });
}

function mutate(envelope: string, patch: (wire: Record<string, string>) => void): string {
  const wire = JSON.parse(envelope) as Record<string, string>;
  patch(wire);
  return JSON.stringify(wire);
}

function flipChar(value: string): string {
  const first = value[0] === 'A' ? 'B' : 'A';
  return `${first}${value.slice(1)}`;
}

describe('call ids and ephemeral keys', () => {
  it('generates 16 byte call ids and 8 byte device ids in base64url without padding', async () => {
    expect(await newCallId()).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(await newDeviceId()).toMatch(/^[A-Za-z0-9_-]{11}$/);
    expect(await newCallId()).not.toBe(await newCallId());
  });

  it('zeroes an ephemeral key pair', async () => {
    const pair = await generateEphemeralKeyPair();
    zeroEphemeralKeyPair(pair);
    expect(pair.privateKey.every((byte) => byte === 0)).toBe(true);
  });
});

describe('invite envelope', () => {
  it('opens with the pinned keys and returns the content', async () => {
    const caller = await party('alice');
    const callee = await party('bob');
    const { envelope, callId } = await invite(caller, callee);

    const content = await openInvite(callee, caller, envelope);

    expect(content).toMatchObject({ callId, roomId: 'room-1', kind: 'video', callerId: 'alice', calleeId: 'bob' });
  });

  it('rejects a tampered box, nonce or signature', async () => {
    const caller = await party('alice');
    const callee = await party('bob');
    const { envelope } = await invite(caller, callee);

    expect(await openInvite(callee, caller, mutate(envelope, (wire) => (wire.box = flipChar(wire.box!))))).toBeNull();
    expect(await openInvite(callee, caller, mutate(envelope, (wire) => (wire.nonce = flipChar(wire.nonce!))))).toBeNull();
    expect(await openInvite(callee, caller, mutate(envelope, (wire) => (wire.sig = flipChar(wire.sig!))))).toBeNull();
  });

  it('rejects an invite signed with a key other than the pinned signing key', async () => {
    const caller = await party('alice');
    const callee = await party('bob');
    const impostor = await party('alice');
    const { envelope } = await invite(caller, callee);

    const content = await openInviteEnvelope({
      identity: callee.identity,
      caller: { publicKey: caller.pinned.publicKey, signingPublicKey: impostor.pinned.signingPublicKey },
      claimedCallerId: 'alice',
      claimedRoomId: 'room-1',
      claimedKind: 'video',
      envelope,
      knownCallIds: new Set(),
    });

    expect(content).toBeNull();
  });

  it('rejects when the caller identity key is not the pinned one', async () => {
    const caller = await party('alice');
    const callee = await party('bob');
    const other = await party('mallory');
    const { envelope } = await invite(caller, callee);

    expect(await openInvite(callee, other, envelope, { callerId: 'alice' })).toBeNull();
  });

  it('rejects an invite addressed to someone else', async () => {
    const caller = await party('alice');
    const callee = await party('bob');
    const bystander = await party('carol');
    const { envelope } = await invite(caller, callee);

    expect(await openInvite(bystander, caller, envelope)).toBeNull();
  });

  it('rejects when the server-claimed caller, room or kind differ', async () => {
    const caller = await party('alice');
    const callee = await party('bob');
    const { envelope } = await invite(caller, callee);

    expect(await openInvite(callee, caller, envelope, { callerId: 'mallory' })).toBeNull();
    expect(await openInvite(callee, caller, envelope, { roomId: 'room-2' })).toBeNull();
    expect(
      await openInviteEnvelope({
        identity: callee.identity,
        caller: caller.pinned,
        claimedCallerId: 'alice',
        claimedRoomId: 'room-1',
        claimedKind: 'voice',
        envelope,
        knownCallIds: new Set(),
      }),
    ).toBeNull();
  });

  it('rejects a reflection to the caller itself', async () => {
    const caller = await party('alice');
    const callee = await party('bob');
    const { envelope } = await invite(caller, callee);

    expect(await openInvite(caller, caller, envelope, { callerId: 'alice' })).toBeNull();
  });

  it('rejects a call to self', async () => {
    const caller = await party('alice');
    const ekA = await generateEphemeralKeyPair();
    const envelope = await createInviteEnvelope({
      identity: caller.identity,
      calleePublicKey: caller.pinned.publicKey,
      callId: await newCallId(),
      roomId: 'room-1',
      kind: 'video',
      calleeId: 'alice',
      ekA: ekA.publicKey,
    });

    expect(await openInvite(caller, caller, envelope)).toBeNull();
  });

  it('rejects a callId that was already seen', async () => {
    const caller = await party('alice');
    const callee = await party('bob');
    const { envelope, callId } = await invite(caller, callee);

    expect(await openInvite(callee, caller, envelope, { known: new Set([callId]) })).toBeNull();
  });

  it('enforces the 60 second timestamp window in both directions', async () => {
    const caller = await party('alice');
    const callee = await party('bob');
    const now = 1_700_000_000_000;
    const { envelope } = await invite(caller, callee, { now });

    expect(await openInvite(callee, caller, envelope, { now: now + CALL_TIMESTAMP_SKEW_MS })).not.toBeNull();
    expect(await openInvite(callee, caller, envelope, { now: now + CALL_TIMESTAMP_SKEW_MS + 1 })).toBeNull();
    expect(await openInvite(callee, caller, envelope, { now: now - CALL_TIMESTAMP_SKEW_MS - 1 })).toBeNull();
  });

  it('rejects malformed and oversized envelopes', async () => {
    const caller = await party('alice');
    const callee = await party('bob');

    expect(await openInvite(callee, caller, 'not json')).toBeNull();
    expect(await openInvite(callee, caller, '{}')).toBeNull();
    expect(await openInvite(callee, caller, 42)).toBeNull();
    expect(await openInvite(callee, caller, `{"v":1,"pad":"${'a'.repeat(5000)}"}`)).toBeNull();
  });
});

describe('accept envelope', () => {
  async function accepted(now?: number) {
    const caller = await party('alice');
    const callee = await party('bob');
    const callId = await newCallId();
    const ekB = await generateEphemeralKeyPair();
    const deviceId = await newDeviceId();
    const envelope = await createAcceptEnvelope({
      identity: callee.identity,
      callerPublicKey: caller.pinned.publicKey,
      callId,
      callerId: 'alice',
      deviceId,
      ekB: ekB.publicKey,
      ...(now === undefined ? {} : { now }),
    });
    return { caller, callee, callId, deviceId, envelope };
  }

  it('opens with the pinned callee keys', async () => {
    const { caller, callee, callId, deviceId, envelope } = await accepted();

    const content = await openAcceptEnvelope({ identity: caller.identity, callee: callee.pinned, expectedCallId: callId, expectedCalleeId: 'bob', envelope });

    expect(content).toMatchObject({ callId, deviceId, callerId: 'alice', calleeId: 'bob' });
  });

  it('rejects another call id, another callee and a wrong pinned key', async () => {
    const { caller, callee, callId, envelope } = await accepted();
    const stranger = await party('bob');

    expect(await openAcceptEnvelope({ identity: caller.identity, callee: callee.pinned, expectedCallId: await newCallId(), expectedCalleeId: 'bob', envelope })).toBeNull();
    expect(await openAcceptEnvelope({ identity: caller.identity, callee: callee.pinned, expectedCallId: callId, expectedCalleeId: 'carol', envelope })).toBeNull();
    expect(await openAcceptEnvelope({ identity: caller.identity, callee: stranger.pinned, expectedCallId: callId, expectedCalleeId: 'bob', envelope })).toBeNull();
  });

  it('rejects tampering, old timestamps and the wrong recipient', async () => {
    const now = 1_700_000_000_000;
    const { caller, callee, callId, envelope } = await accepted(now);
    const base = { callee: callee.pinned, expectedCallId: callId, expectedCalleeId: 'bob' };

    expect(await openAcceptEnvelope({ identity: caller.identity, ...base, envelope, now })).not.toBeNull();
    expect(await openAcceptEnvelope({ identity: caller.identity, ...base, envelope: mutate(envelope, (wire) => (wire.box = flipChar(wire.box!))), now })).toBeNull();
    expect(await openAcceptEnvelope({ identity: caller.identity, ...base, envelope, now: now + CALL_TIMESTAMP_SKEW_MS + 1 })).toBeNull();
    expect(await openAcceptEnvelope({ identity: callee.identity, ...base, envelope, now })).toBeNull();
  });

  it('does not open an invite as an accept (context separation)', async () => {
    const caller = await party('alice');
    const callee = await party('bob');
    const { envelope, callId } = await invite(caller, callee);

    expect(await openAcceptEnvelope({ identity: callee.identity, callee: caller.pinned, expectedCallId: callId, expectedCalleeId: 'alice', envelope })).toBeNull();
  });
});

describe('session keys and signal channel', () => {
  async function channels(callId?: string) {
    const caller = await party('alice');
    const callee = await party('bob');
    const id = callId ?? (await newCallId());
    const ekA = await generateEphemeralKeyPair();
    const ekB = await generateEphemeralKeyPair();
    const callerKeys = await deriveSessionKeys({
      role: 'caller',
      callId: id,
      callerPublicKey: caller.pinned.publicKey,
      calleePublicKey: callee.pinned.publicKey,
      ownEphemeral: ekA,
      peerEphemeralPublicKey: Buffer.from(ekB.publicKey).toString('base64url'),
    });
    const calleeKeys = await deriveSessionKeys({
      role: 'callee',
      callId: id,
      callerPublicKey: caller.pinned.publicKey,
      calleePublicKey: callee.pinned.publicKey,
      ownEphemeral: ekB,
      peerEphemeralPublicKey: Buffer.from(ekA.publicKey).toString('base64url'),
    });
    return {
      callerKeys,
      calleeKeys,
      callerChannel: new SignalChannel({ callId: id, selfId: 'alice', peerId: 'bob', keys: callerKeys }),
      calleeChannel: new SignalChannel({ callId: id, selfId: 'bob', peerId: 'alice', keys: calleeKeys }),
      ekA,
      ekB,
      caller,
      callee,
      callId: id,
    };
  }

  it('derives mirrored per direction keys that differ from each other', async () => {
    const { callerKeys, calleeKeys } = await channels();

    expect(Buffer.from(callerKeys.send).equals(Buffer.from(calleeKeys.receive))).toBe(true);
    expect(Buffer.from(callerKeys.receive).equals(Buffer.from(calleeKeys.send))).toBe(true);
    expect(Buffer.from(callerKeys.send).equals(Buffer.from(callerKeys.receive))).toBe(false);
  });

  it('round trips every signal type in both directions', async () => {
    const { callerChannel, calleeChannel } = await channels();

    const offer = await callerChannel.seal('offer', { description: { type: 'offer', sdp: 'v=0' } });
    const opened = await calleeChannel.open(offer, 'alice');
    expect(opened).toMatchObject({ type: 'offer', seq: 1, epoch: 0 });
    expect(opened?.payload.description).toEqual({ type: 'offer', sdp: 'v=0' });

    const answer = await calleeChannel.seal('answer', { description: { type: 'answer', sdp: 'v=0' } });
    expect((await callerChannel.open(answer, 'bob'))?.type).toBe('answer');
    const candidate = await callerChannel.seal('candidate', { candidate: { candidate: 'x' } });
    expect((await calleeChannel.open(candidate, 'alice'))?.type).toBe('candidate');
    const end = await callerChannel.seal('end-of-candidates', {});
    expect((await calleeChannel.open(end, 'alice'))?.type).toBe('end-of-candidates');
  });

  it('rejects a replayed and an older sequence number', async () => {
    const { callerChannel, calleeChannel } = await channels();
    const first = await callerChannel.seal('candidate', { candidate: { candidate: 'a' } });
    const second = await callerChannel.seal('candidate', { candidate: { candidate: 'b' } });

    expect(await calleeChannel.open(second, 'alice')).not.toBeNull();
    expect(await calleeChannel.open(second, 'alice')).toBeNull();
    expect(await calleeChannel.open(first, 'alice')).toBeNull();
  });

  it('rejects a message reflected back to its sender', async () => {
    const { callerChannel } = await channels();
    const sealed = await callerChannel.seal('candidate', { candidate: { candidate: 'a' } });

    expect(await callerChannel.open(sealed, 'bob')).toBeNull();
    expect(await callerChannel.open(sealed, 'alice')).toBeNull();
  });

  it('rejects the wrong sender, wrong recipient and unknown senders', async () => {
    const { callerChannel, calleeChannel } = await channels();
    const sealed = await callerChannel.seal('candidate', { candidate: { candidate: 'a' } });

    expect(await calleeChannel.open(sealed, 'mallory')).toBeNull();
    expect(await calleeChannel.open(sealed, 'alice', 'carol')).toBeNull();
    expect(await calleeChannel.open(sealed, 'alice')).not.toBeNull();
  });

  it('rejects a message from another call even with identical parties', async () => {
    const first = await channels();
    const second = await channels();
    const sealed = await first.callerChannel.seal('candidate', { candidate: { candidate: 'a' } });

    expect(await second.calleeChannel.open(sealed, 'alice')).toBeNull();
  });

  it('rejects when the call id used in the additional data differs', async () => {
    const one = await channels();
    const calleeOther = new SignalChannel({ callId: await newCallId(), selfId: 'bob', peerId: 'alice', keys: one.calleeKeys });
    const sealed = await one.callerChannel.seal('candidate', { candidate: { candidate: 'a' } });

    expect(await calleeOther.open(sealed, 'alice')).toBeNull();
  });

  it('rejects tampering with the clear type, sequence, epoch or ciphertext', async () => {
    const { callerChannel, calleeChannel } = await channels();
    const sealed = await callerChannel.seal('candidate', { candidate: { candidate: 'a' } });

    expect(await calleeChannel.open(mutate(sealed, (wire) => (wire.type = 'offer')), 'alice')).toBeNull();
    const asNumbers = JSON.parse(sealed) as Record<string, unknown>;
    expect(await calleeChannel.open(JSON.stringify({ ...asNumbers, seq: 99 }), 'alice')).toBeNull();
    expect(await calleeChannel.open(JSON.stringify({ ...asNumbers, epoch: 1 }), 'alice')).toBeNull();
    expect(await calleeChannel.open(mutate(sealed, (wire) => (wire.ct = flipChar(wire.ct!))), 'alice')).toBeNull();
    expect(await calleeChannel.open(sealed, 'alice')).not.toBeNull();
  });

  it('advances the epoch on ice-restart and rejects messages from an older epoch', async () => {
    const { callerChannel, calleeChannel } = await channels();
    const stale = await callerChannel.seal('candidate', { candidate: { candidate: 'old' } });
    const restart = await callerChannel.seal('ice-restart', {});

    expect(callerChannel.currentEpoch).toBe(1);
    expect((await calleeChannel.open(restart, 'alice'))?.epoch).toBe(1);
    expect(calleeChannel.currentEpoch).toBe(0);
    expect(await calleeChannel.open(stale, 'alice')).toBeNull();
    const fresh = await callerChannel.seal('candidate', { candidate: { candidate: 'new' } });
    expect((await calleeChannel.open(fresh, 'alice'))?.epoch).toBe(1);
  });

  it('keeps send and receive epochs independent so a local ice-restart does not break receiving', async () => {
    const { callerChannel, calleeChannel } = await channels();
    await callerChannel.seal('ice-restart', {});

    const fromPeer = await calleeChannel.seal('candidate', { candidate: { candidate: 'x' } });

    expect(callerChannel.currentEpoch).toBe(1);
    expect((await callerChannel.open(fromPeer, 'bob'))?.epoch).toBe(0);
  });

  it('refuses to send or open oversized messages', async () => {
    const { callerChannel, calleeChannel } = await channels();

    await expect(callerChannel.seal('offer', { sdp: 'a'.repeat(MAX_SIGNAL_WIRE_LENGTH) })).rejects.toThrow('too large');
    expect(await calleeChannel.open('x'.repeat(MAX_SIGNAL_WIRE_LENGTH + 1), 'alice')).toBeNull();
  });

  it('rejects malformed wire values', async () => {
    const { calleeChannel } = await channels();

    for (const wire of ['', 'nope', '[]', '{"v":2}', '{"v":1,"type":"offer"}', 5, null, undefined]) {
      expect(await calleeChannel.open(wire, 'alice')).toBeNull();
    }
    expect(
      await calleeChannel.open(JSON.stringify({ v: 1, type: 'bogus', seq: 1, epoch: 0, nonce: 'AAAA', ct: 'AAAA' }), 'alice'),
    ).toBeNull();
  });

  it('stops working after dispose and wipes the keys', async () => {
    const { callerChannel, callerKeys } = await channels();
    callerChannel.dispose();

    expect(callerKeys.send.every((byte) => byte === 0)).toBe(true);
    await expect(callerChannel.seal('candidate', {})).rejects.toThrow('closed');
  });
});

describe('call transfer envelopes', () => {
  async function transfer(now?: number) {
    const alice = await party('alice');
    const bob = await party('bob');
    const callId = await newCallId();
    const deviceId = await newDeviceId();
    const ek = await generateEphemeralKeyPair();
    const envelope = await createTransferEnvelope({
      identity: alice.identity,
      peerPublicKey: bob.pinned.publicKey,
      peerId: 'bob',
      callId,
      role: 'caller',
      deviceId,
      ek: ek.publicKey,
      ...(now === undefined ? {} : { now }),
    });
    return { alice, bob, callId, deviceId, ek, envelope };
  }

  const open = (t: Awaited<ReturnType<typeof transfer>>, extra: { role?: 'caller' | 'callee'; callId?: string; senderId?: string; sender?: PinnedPeer; envelope?: string; now?: number } = {}) =>
    openTransferEnvelope({
      identity: t.bob.identity,
      sender: extra.sender ?? t.alice.pinned,
      expectedCallId: extra.callId ?? t.callId,
      expectedSenderId: extra.senderId ?? 'alice',
      expectedSenderRole: extra.role ?? 'caller',
      envelope: extra.envelope ?? t.envelope,
      ...(extra.now === undefined ? {} : { now: extra.now }),
    });

  it('opens a signed transfer from the pinned peer key with the new device and ephemeral key', async () => {
    const t = await transfer();
    const content = await open(t);
    expect(content).toMatchObject({ callId: t.callId, senderId: 'alice', recipientId: 'bob', senderRole: 'caller', deviceId: t.deviceId });
  });

  it('rejects a transfer from another key, for another call, role or sender, tampered or stale', async () => {
    const t = await transfer();
    const mallory = await party('mallory');
    expect(await open(t, { sender: mallory.pinned })).toBeNull();
    expect(await open(t, { callId: await newCallId() })).toBeNull();
    expect(await open(t, { role: 'callee' })).toBeNull();
    expect(await open(t, { senderId: 'mallory' })).toBeNull();
    expect(await open(t, { envelope: mutate(t.envelope, (wire) => { wire.box = flipChar(wire.box ?? ''); }) })).toBeNull();
    expect(await open(t, { now: Date.now() + CALL_TIMESTAMP_SKEW_MS + 5_000 })).toBeNull();
    const signedByAliceForAlice = await createTransferEnvelope({ identity: t.alice.identity, peerPublicKey: t.alice.pinned.publicKey, peerId: 'alice', callId: t.callId, role: 'caller', deviceId: t.deviceId, ek: t.ek.publicKey });
    expect(await openTransferEnvelope({ identity: t.alice.identity, sender: t.alice.pinned, expectedCallId: t.callId, expectedSenderId: 'alice', expectedSenderRole: 'caller', envelope: signedByAliceForAlice })).toBeNull();
  });

  it('binds the answer to the transferring device and derives matching fresh session keys', async () => {
    const t = await transfer();
    const content = (await open(t))!;
    const bobEk = await generateEphemeralKeyPair();
    const reply = await createTransferAcceptEnvelope({ identity: t.bob.identity, peerPublicKey: t.alice.pinned.publicKey, peerId: 'alice', callId: t.callId, deviceId: content.deviceId, ek: bobEk.publicKey });
    const opened = await openTransferAcceptEnvelope({ identity: t.alice.identity, sender: t.bob.pinned, expectedCallId: t.callId, expectedSenderId: 'bob', expectedDeviceId: t.deviceId, envelope: reply });
    expect(opened?.deviceId).toBe(t.deviceId);
    expect(await openTransferAcceptEnvelope({ identity: t.alice.identity, sender: t.bob.pinned, expectedCallId: t.callId, expectedSenderId: 'bob', expectedDeviceId: await newDeviceId(), envelope: reply })).toBeNull();
    expect(await openTransferEnvelope({ identity: t.bob.identity, sender: t.alice.pinned, expectedCallId: t.callId, expectedSenderId: 'alice', expectedSenderRole: 'caller', envelope: reply })).toBeNull();

    const aliceKeys = await deriveSessionKeys({ role: 'caller', callId: t.callId, callerPublicKey: t.alice.pinned.publicKey, calleePublicKey: t.bob.pinned.publicKey, ownEphemeral: t.ek, peerEphemeralPublicKey: opened!.ek });
    const bobKeys = await deriveSessionKeys({ role: 'callee', callId: t.callId, callerPublicKey: t.alice.pinned.publicKey, calleePublicKey: t.bob.pinned.publicKey, ownEphemeral: bobEk, peerEphemeralPublicKey: content.ek });
    const aliceChannel = new SignalChannel({ callId: t.callId, selfId: 'alice', peerId: 'bob', keys: aliceKeys });
    const bobChannel = new SignalChannel({ callId: t.callId, selfId: 'bob', peerId: 'alice', keys: bobKeys });
    const wire = await aliceChannel.seal('offer', { description: 'x' });
    expect((await bobChannel.open(wire, 'alice'))?.payload.description).toBe('x');
  });
});
