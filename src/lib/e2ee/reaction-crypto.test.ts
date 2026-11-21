import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSocket, MessageReaction, MessageView } from '@lib/socket';
import { sealAuthenticatedField } from './authenticated-field';
import { setCurrentIdentity } from './current-identity';
import { decryptMessageView, decryptRoomSummary } from './message-crypto';
import {
  isReactionEmoji,
  openReactions,
  padReaction,
  REACTION_EMOJI_MAX_BYTES,
  REACTION_FIELD_LABEL,
  REACTION_PLAINTEXT_BYTES,
  reactionEventTime,
  sealReaction,
  unpadReaction,
} from './reaction-crypto';
import { deriveSigningKeyPair } from './signing';
import { getSodium } from './sodium';

const roomKeys = vi.hoisted(() => new Map<string, { keyId: string; epoch: number; key: Uint8Array }[]>());
const contactSigningKeys = vi.hoisted(() => new Map<string, string>());
const groupContext = vi.hoisted(() => {
  const holder: { current: unknown } = { current: null };
  return holder;
});

vi.mock('./room-keys', () => {
  class MissingRoomKeyError extends Error {}
  return {
    MissingRoomKeyError,
    requireCurrentRoomKey: (roomId: string) => {
      const current = roomKeys.get(roomId)?.at(-1);
      if (!current) {
        throw new MissingRoomKeyError();
      }
      return current;
    },
    getGroupSenderContext: () => Promise.resolve(groupContext.current),
    getMemberNickname: () => undefined,
    retryDeferredEnvelopes: () => Promise.resolve(),
    getVerifiedGroupAdmins: () => null,
    currentGroupEpoch: () => 0,
    resolveSigningPublicKey: () => Promise.resolve(null),
    ensureRoomKeyGeneration: (_socket: unknown, roomId: string, keyId: string) =>
      Promise.resolve(roomKeys.get(roomId)?.find((generation) => generation.keyId === keyId)?.key ?? null),
    lookupContactKey: (_socket: unknown, userId: string) => {
      const signingPublicKey = contactSigningKeys.get(userId);
      return Promise.resolve(signingPublicKey ? { contactId: userId, status: 'verified', pin: { signingPublicKey } } : null);
    },
  };
});

const ROOM_ID = 'room-1';
const MESSAGE_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const OTHER_MESSAGE_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const ALICE = 'user-alice';
const BOB = 'user-bob';
const socket = {} as AppSocket;
const encoder = new TextEncoder();

function randomKeyId(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function addGeneration(): { keyId: string; key: Uint8Array } {
  const generations = roomKeys.get(ROOM_ID) ?? [];
  const generation = { keyId: randomKeyId(), epoch: generations.length + 1, key: crypto.getRandomValues(new Uint8Array(32)) };
  roomKeys.set(ROOM_ID, [...generations, generation]);
  return generation;
}

interface Person {
  userId: string;
  privateKey: Uint8Array;
}

async function becomeContact(person: Person): Promise<void> {
  const sodium = await getSodium();
  const signing = await deriveSigningKeyPair(person.privateKey);
  contactSigningKeys.set(person.userId, sodium.to_base64(signing.publicKey));
}

function actAs(person: Person): void {
  setCurrentIdentity({ userId: person.userId, publicKey: 'unused', privateKey: person.privateKey });
}

function reaction(userId: string, emoji: string): MessageReaction {
  return { userId, emoji, updatedAt: '2026-11-20T10:00:00.000Z' };
}

const alice: Person = { userId: ALICE, privateKey: crypto.getRandomValues(new Uint8Array(32)) };
const bob: Person = { userId: BOB, privateKey: crypto.getRandomValues(new Uint8Array(32)) };

beforeEach(async () => {
  groupContext.current = null;
  roomKeys.clear();
  contactSigningKeys.clear();
  addGeneration();
  await becomeContact(alice);
  await becomeContact(bob);
});

afterEach(() => {
  setCurrentIdentity(null);
});

describe('reaction emoji validation', () => {
  it.each(['❤️', '👍', '👍🏽', '😂', '👨‍👩‍👧', '🏳️‍🌈', '🇧🇷', '1️⃣', '#️⃣', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '☺', '🫶🏾'])('accepts %s', (emoji) => {
    expect(isReactionEmoji(emoji)).toBe(true);
  });

  it.each(['', ' ', 'a', 'ok', 'é', '1', '❤️❤️', 'a❤️', '❤️ ', '\u0000', '❤️\u0000x', '<script>', '🇧', '\u200D'])('rejects %j', (value) => {
    expect(isReactionEmoji(value)).toBe(false);
  });

  it('still validates emoji where Intl.Segmenter is missing', () => {
    const original = Intl.Segmenter;
    Object.defineProperty(Intl, 'Segmenter', { value: undefined, configurable: true, writable: true });
    try {
      expect(isReactionEmoji('❤️')).toBe(true);
      expect(isReactionEmoji('👨‍👩‍👧')).toBe(true);
      expect(isReactionEmoji('🇧🇷')).toBe(true);
      expect(isReactionEmoji('❤️❤️')).toBe(false);
      expect(isReactionEmoji('oi')).toBe(false);
      expect(unpadReaction(padReaction('😂'))).toBe('😂');
    } finally {
      Object.defineProperty(Intl, 'Segmenter', { value: original, configurable: true, writable: true });
    }
  });

  it('rejects a single grapheme that is larger than the emoji budget', () => {
    const chain = `${'👍\u200D'.repeat(10)}👍`;
    expect(encoder.encode(chain).length).toBeGreaterThan(REACTION_EMOJI_MAX_BYTES);
    expect(isReactionEmoji(chain)).toBe(false);
  });
});

describe('reaction padding', () => {
  it.each(['❤️', '👨‍👩‍👧', '🇧🇷', '🏴󠁧󠁢󠁥󠁮󠁧󠁿'])('pads %s to a fixed size and back', (emoji) => {
    const padded = padReaction(emoji);
    expect(encoder.encode(padded).length).toBe(REACTION_PLAINTEXT_BYTES);
    expect(unpadReaction(padded)).toBe(emoji);
  });

  it('refuses to pad text or oversized input', () => {
    expect(() => padReaction('oi')).toThrow();
    expect(() => padReaction(`${'👍\u200D'.repeat(10)}👍`)).toThrow();
  });

  it('rejects padded plaintext that is not a single emoji or is too long', () => {
    expect(unpadReaction('oi' + '\u0000'.repeat(62))).toBeNull();
    expect(unpadReaction('❤️\u0000x' + '\u0000'.repeat(50))).toBeNull();
    expect(unpadReaction('❤️' + '\u0000'.repeat(REACTION_PLAINTEXT_BYTES))).toBeNull();
    expect(unpadReaction('\u0000'.repeat(REACTION_PLAINTEXT_BYTES))).toBeNull();
  });
});

describe('sealed reactions', () => {
  it('round-trips a reaction and hides the emoji from the server', async () => {
    actAs(alice);
    const sealed = await sealReaction({ roomId: ROOM_ID, messageId: MESSAGE_ID }, '😂');
    expect(sealed.startsWith('e2e:v2:')).toBe(true);
    expect(sealed).not.toContain('😂');
    expect(sealed.length).toBeLessThan(400);

    actAs(bob);
    await expect(openReactions(socket, ROOM_ID, MESSAGE_ID, [reaction(ALICE, sealed)])).resolves.toEqual([reaction(ALICE, '😂')]);
  });

  it('produces ciphertexts of the same length for every emoji', async () => {
    actAs(alice);
    const lengths = await Promise.all(['❤️', '👍', '👨‍👩‍👧', '🇧🇷'].map((emoji) => sealReaction({ roomId: ROOM_ID, messageId: MESSAGE_ID }, emoji)));
    expect(new Set(lengths.map((value) => value.length)).size).toBe(1);
  });

  it('drops a reaction moved to another message or attributed to another person', async () => {
    actAs(alice);
    const sealed = await sealReaction({ roomId: ROOM_ID, messageId: MESSAGE_ID }, '❤️');

    actAs(bob);
    await expect(openReactions(socket, ROOM_ID, OTHER_MESSAGE_ID, [reaction(ALICE, sealed)])).resolves.toEqual([]);
    await expect(openReactions(socket, ROOM_ID, MESSAGE_ID, [reaction(BOB, sealed)])).resolves.toEqual([]);
    await expect(openReactions(socket, 'room-2', MESSAGE_ID, [reaction(ALICE, sealed)])).resolves.toEqual([]);
  });

  it('drops fields sealed for another purpose, non-emoji plaintext, unknown keys and garbage', async () => {
    const generation = roomKeys.get(ROOM_ID)![0]!;
    const signing = await deriveSigningKeyPair(alice.privateKey);
    const context = { roomId: ROOM_ID, senderId: ALICE, messageId: MESSAGE_ID, keyId: generation.keyId };
    const asContent = await sealAuthenticatedField(padReaction('❤️'), generation.key, signing.privateKey, { ...context, label: 'content' });
    const asText = await sealAuthenticatedField('oi'.padEnd(64, '\u0000'), generation.key, signing.privateKey, { ...context, label: REACTION_FIELD_LABEL });
    const unpadded = await sealAuthenticatedField('❤️', generation.key, signing.privateKey, { ...context, label: REACTION_FIELD_LABEL });
    const unknownKey = await sealAuthenticatedField(padReaction('❤️'), crypto.getRandomValues(new Uint8Array(32)), signing.privateKey, {
      ...context,
      keyId: randomKeyId(),
      label: REACTION_FIELD_LABEL,
    });

    actAs(bob);
    const opened = await openReactions(socket, ROOM_ID, MESSAGE_ID, [
      reaction(ALICE, asContent),
      reaction(BOB, asText),
      reaction('user-carol', unknownKey),
      reaction('user-dave', 'e2e:v2:not-a-field'),
      reaction('user-erin', '❤️'),
    ]);
    expect(opened).toEqual([]);
    await expect(openReactions(socket, ROOM_ID, MESSAGE_ID, [reaction(ALICE, unpadded)])).resolves.toEqual([reaction(ALICE, '❤️')]);
  });

  it('drops reactions whose signer is unknown and keeps one reaction per person', async () => {
    actAs(alice);
    const first = await sealReaction({ roomId: ROOM_ID, messageId: MESSAGE_ID }, '❤️');
    const second = await sealReaction({ roomId: ROOM_ID, messageId: MESSAGE_ID }, '👍');

    actAs(bob);
    await expect(openReactions(socket, ROOM_ID, MESSAGE_ID, [reaction(ALICE, first), reaction(ALICE, second)])).resolves.toEqual([reaction(ALICE, '❤️')]);
    contactSigningKeys.delete(ALICE);
    await expect(openReactions(socket, ROOM_ID, MESSAGE_ID, [reaction(ALICE, first)])).resolves.toEqual([]);
  });

  it('opens reactions sealed with an older room key', async () => {
    actAs(alice);
    const sealed = await sealReaction({ roomId: ROOM_ID, messageId: MESSAGE_ID }, '🙏');
    addGeneration();

    actAs(bob);
    await expect(openReactions(socket, ROOM_ID, MESSAGE_ID, [reaction(ALICE, sealed)])).resolves.toEqual([reaction(ALICE, '🙏')]);
  });

  it('refuses to seal anything that is not a single emoji', async () => {
    actAs(alice);
    await expect(sealReaction({ roomId: ROOM_ID, messageId: MESSAGE_ID }, 'olá')).rejects.toThrow();
  });
});

describe('reactions inside message views', () => {
  function view(overrides: Partial<MessageView>): MessageView {
    return {
      id: MESSAGE_ID,
      roomId: ROOM_ID,
      sender: { id: 'system', nickname: 'Sistema', avatar: null },
      content: 'x',
      type: 'system',
      duration: null,
      timestamp: '2026-11-20T10:00:00.000Z',
      deletedForEveryone: false,
      status: 'sent',
      deliveredTo: [],
      readBy: [],
      playedBy: [],
      replyTo: null,
      mentionedUserIds: [],
      fileMeta: null,
      caption: null,
      linkPreview: null,
      ...overrides,
    };
  }

  it('opens valid reactions, drops tampered ones and tolerates servers that send none', async () => {
    actAs(alice);
    const sealed = await sealReaction({ roomId: ROOM_ID, messageId: MESSAGE_ID }, '😮');
    const foreign = await sealReaction({ roomId: ROOM_ID, messageId: OTHER_MESSAGE_ID }, '😮');

    actAs(bob);
    const opened = await decryptMessageView(socket, view({ reactions: [reaction(ALICE, sealed), reaction(BOB, foreign)] }));
    expect(opened.reactions).toEqual([reaction(ALICE, '😮')]);
    await expect(decryptMessageView(socket, view({}))).resolves.toMatchObject({ reactions: [] });
    await expect(decryptMessageView(socket, view({ deletedForEveryone: true, reactions: [reaction(ALICE, sealed)] }))).resolves.toMatchObject({
      reactions: [],
    });
  });

  it('skips reaction work for the room list preview', async () => {
    actAs(alice);
    const sealed = await sealReaction({ roomId: ROOM_ID, messageId: MESSAGE_ID }, '😮');
    const room = await decryptRoomSummary(socket, {
      id: ROOM_ID,
      type: 'private',
      lastMessage: view({ reactions: [reaction(ALICE, sealed)] }),
    } as Parameters<typeof decryptRoomSummary>[1]);
    expect(room.lastMessage?.reactions).toEqual([]);
  });
});

describe('reactions from people who left a group', () => {
  const removedAt = Date.parse('2026-11-20T12:00:00.000Z');

  function groupWithoutAlice(): void {
    const [first] = roomKeys.get(ROOM_ID)!;
    const second = addGeneration();
    groupContext.current = {
      isMember: (userId: string) => userId !== ALICE,
      generations: [
        { epoch: 1, keyId: first!.keyId, signed: true, roster: { members: [{ userId: ALICE }, { userId: BOB }], issuedAt: 0 } },
        { epoch: 2, keyId: second.keyId, signed: true, roster: { members: [{ userId: BOB }], issuedAt: removedAt } },
      ],
    };
  }

  it('keeps a reaction made while the person was still a member, even when the update arrives later', async () => {
    actAs(alice);
    const sealed = await sealReaction({ roomId: ROOM_ID, messageId: MESSAGE_ID }, '❤️');
    groupWithoutAlice();

    actAs(bob);
    const before = { userId: ALICE, emoji: sealed, updatedAt: '2026-11-20T11:00:00.000Z' };
    await expect(openReactions(socket, ROOM_ID, MESSAGE_ID, [before], { messageTimestamp: '2026-11-20T10:00:00.000Z' })).resolves.toEqual([
      { ...before, emoji: '❤️' },
    ]);
  });

  it('drops a reaction dated after the removal and cannot be antedated before its message', async () => {
    actAs(alice);
    const sealed = await sealReaction({ roomId: ROOM_ID, messageId: MESSAGE_ID }, '❤️');
    groupWithoutAlice();

    actAs(bob);
    const after = { userId: ALICE, emoji: sealed, updatedAt: '2026-11-20T13:00:00.000Z' };
    await expect(openReactions(socket, ROOM_ID, MESSAGE_ID, [after], { messageTimestamp: '2026-11-20T10:00:00.000Z' })).resolves.toEqual([]);
    const antedated = { userId: ALICE, emoji: sealed, updatedAt: '2020-01-01T00:00:00.000Z' };
    await expect(openReactions(socket, ROOM_ID, MESSAGE_ID, [antedated], { messageTimestamp: '2026-11-20T12:30:00.000Z' })).resolves.toEqual([]);
  });

  it('never dates a reaction before the message it targets', () => {
    expect(reactionEventTime('2020-01-01T00:00:00.000Z', '2026-11-20T10:00:00.000Z')).toBe('2026-11-20T10:00:00.000Z');
    expect(reactionEventTime('2026-11-20T11:00:00.000Z', '2026-11-20T10:00:00.000Z')).toBe('2026-11-20T11:00:00.000Z');
    expect(reactionEventTime('2026-11-20T11:00:00.000Z', undefined)).toBe('2026-11-20T11:00:00.000Z');
    expect(reactionEventTime('garbage', '2026-11-20T10:00:00.000Z')).toBe('2026-11-20T10:00:00.000Z');
  });
});
