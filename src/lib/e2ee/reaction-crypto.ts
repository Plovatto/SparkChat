import type { AppSocket, MessageReaction } from '@lib/socket';
import { openAuthenticatedField, parseAuthenticatedField, sealAuthenticatedField } from './authenticated-field';
import { getCurrentIdentity } from './current-identity';
import { checkGroupSender } from './group-event-trust';
import { ensureRoomKeyGeneration, requireCurrentRoomKey } from './room-keys';
import { resolveSenderSigningKey } from './sender-signing-key';
import { deriveSigningKeyPair } from './signing';

export const REACTION_PLAINTEXT_BYTES = 64;
export const REACTION_EMOJI_MAX_BYTES = 48;
export const REACTION_FIELD_LABEL = 'reaction';

const PADDING_CHARACTER = '\u0000';
const EMOJI_COMPONENT = String.raw`\p{Extended_Pictographic}[\u{FE0E}\u{FE0F}]?\p{Emoji_Modifier}?[\u{E0020}-\u{E007E}]*\u{E007F}?`;
const SINGLE_EMOJI_PATTERN = new RegExp(
  String.raw`^(?:\p{Regional_Indicator}{2}|[0-9#*]\u{FE0F}?\u{20E3}|${EMOJI_COMPONENT}(?:\u{200D}${EMOJI_COMPONENT})*)$`,
  'u',
);

const encoder = new TextEncoder();
let graphemeSegmenter: Intl.Segmenter | null = null;

function countGraphemes(value: string): number | null {
  if (typeof Intl.Segmenter !== 'function') {
    return null;
  }
  graphemeSegmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  let count = 0;
  for (const segment of graphemeSegmenter.segment(value)) {
    if (segment.segment.length > 0) {
      count += 1;
    }
  }
  return count;
}

export function isReactionEmoji(value: string): boolean {
  if (value.length === 0 || encoder.encode(value).length > REACTION_EMOJI_MAX_BYTES) {
    return false;
  }
  const graphemes = countGraphemes(value);
  return (graphemes === null || graphemes === 1) && SINGLE_EMOJI_PATTERN.test(value);
}

export function padReaction(emoji: string): string {
  if (!isReactionEmoji(emoji)) {
    throw new Error('Reaction must be a single emoji');
  }
  return emoji + PADDING_CHARACTER.repeat(REACTION_PLAINTEXT_BYTES - encoder.encode(emoji).length);
}

export function unpadReaction(plaintext: string): string | null {
  if (encoder.encode(plaintext).length > REACTION_PLAINTEXT_BYTES) {
    return null;
  }
  let end = plaintext.length;
  while (end > 0 && plaintext.charCodeAt(end - 1) === 0) {
    end -= 1;
  }
  const emoji = plaintext.slice(0, end);
  return isReactionEmoji(emoji) ? emoji : null;
}

export interface ReactionTarget {
  roomId: string;
  messageId: string;
}

export async function sealReaction(target: ReactionTarget, emoji: string): Promise<string> {
  const plaintext = padReaction(emoji);
  const generation = requireCurrentRoomKey(target.roomId);
  const identity = getCurrentIdentity();
  if (!identity) {
    throw new Error('Cannot encrypt a reaction without an identity');
  }
  const signingKeys = await deriveSigningKeyPair(identity.privateKey);
  try {
    return await sealAuthenticatedField(plaintext, generation.key, signingKeys.privateKey, {
      roomId: target.roomId,
      senderId: identity.userId,
      messageId: target.messageId,
      keyId: generation.keyId,
      label: REACTION_FIELD_LABEL,
    });
  } finally {
    signingKeys.privateKey.fill(0);
  }
}

interface OpenReactionOptions {
  messageTimestamp?: string | undefined;
}

export function reactionEventTime(updatedAt: string, messageTimestamp: string | undefined): string {
  const reacted = Date.parse(updatedAt);
  const sent = messageTimestamp ? Date.parse(messageTimestamp) : Number.NaN;
  if (!Number.isFinite(sent)) {
    return updatedAt;
  }
  return Number.isFinite(reacted) && reacted > sent ? updatedAt : new Date(sent).toISOString();
}

async function openReaction(
  socket: AppSocket,
  target: ReactionTarget,
  reaction: MessageReaction,
  options: OpenReactionOptions,
): Promise<MessageReaction | null> {
  const parsed = parseAuthenticatedField(reaction.emoji);
  if (!parsed) {
    return null;
  }
  try {
    const roomKey = await ensureRoomKeyGeneration(socket, target.roomId, parsed.keyId);
    if (!roomKey) {
      return null;
    }
    const source = {
      messageId: target.messageId,
      senderId: reaction.userId,
      timestamp: reactionEventTime(reaction.updatedAt, options.messageTimestamp),
      live: false,
    };
    if ((await checkGroupSender(target.roomId, parsed.keyId, source)) !== 'ok') {
      return null;
    }
    const signingKey = await resolveSenderSigningKey(socket, reaction.userId);
    if (!signingKey) {
      return null;
    }
    const plaintext = await openAuthenticatedField(reaction.emoji, roomKey, signingKey, {
      roomId: target.roomId,
      senderId: reaction.userId,
      messageId: target.messageId,
      keyId: parsed.keyId,
      label: REACTION_FIELD_LABEL,
    });
    const emoji = unpadReaction(plaintext);
    return emoji ? { userId: reaction.userId, emoji, updatedAt: reaction.updatedAt } : null;
  } catch {
    return null;
  }
}

function isReactionShape(value: unknown): value is MessageReaction {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<Record<keyof MessageReaction, unknown>>;
  return typeof candidate.userId === 'string' && typeof candidate.emoji === 'string' && typeof candidate.updatedAt === 'string';
}

export async function openReactions(
  socket: AppSocket,
  roomId: string,
  messageId: string,
  reactions: readonly MessageReaction[] | undefined,
  options: OpenReactionOptions = {},
): Promise<MessageReaction[]> {
  const list: readonly unknown[] = Array.isArray(reactions) ? reactions : [];
  const seen = new Set<string>();
  const unique = list.filter((reaction): reaction is MessageReaction => {
    if (!isReactionShape(reaction) || seen.has(reaction.userId)) {
      return false;
    }
    seen.add(reaction.userId);
    return true;
  });
  if (unique.length === 0) {
    return [];
  }
  const opened = await Promise.all(unique.map((reaction) => openReaction(socket, { roomId, messageId }, reaction, options)));
  return opened.filter((reaction): reaction is MessageReaction => reaction !== null);
}
