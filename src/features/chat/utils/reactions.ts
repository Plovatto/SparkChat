import { getDisplayName } from '@lib/format';
import type { MessageReaction, MessageType, RoomParticipant } from '@lib/socket';

export const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '🙏', '👍'] as const;

export const REACTION_COMPACT_QUERY = '(max-width: 768px)';

export interface ReactionSummary {
  emoji: string;
  count: number;
  userIds: string[];
  includesOwn: boolean;
}

const NON_REACTABLE_TYPES: ReadonlySet<MessageType> = new Set(['system', 'error']);

export function canReactToMessage(message: { type: MessageType; deletedForEveryone: boolean; pending?: boolean; failed?: boolean }): boolean {
  return !message.deletedForEveryone && !message.pending && !message.failed && !NON_REACTABLE_TYPES.has(message.type);
}

export function findOwnReaction(reactions: readonly MessageReaction[] | undefined, userId: string): string | null {
  return reactions?.find((reaction) => reaction.userId === userId)?.emoji ?? null;
}

export function applyOwnReaction(
  reactions: readonly MessageReaction[] | undefined,
  userId: string,
  emoji: string | null,
  updatedAt: string,
): MessageReaction[] {
  const others = (reactions ?? []).filter((reaction) => reaction.userId !== userId);
  return emoji ? [...others, { userId, emoji, updatedAt }] : others;
}

export function nextOwnReaction(current: string | null, chosen: string): string | null {
  return current === chosen ? null : chosen;
}

export function sameReactions(left: readonly MessageReaction[] | undefined, right: readonly MessageReaction[] | undefined): boolean {
  const a = left ?? [];
  const b = right ?? [];
  return a.length === b.length && a.every((reaction, index) => reaction.userId === b[index]?.userId && reaction.emoji === b[index]?.emoji);
}

export function summarizeReactions(reactions: readonly MessageReaction[] | undefined, currentUserId: string | undefined): ReactionSummary[] {
  const byEmoji = new Map<string, ReactionSummary>();
  for (const reaction of reactions ?? []) {
    const summary = byEmoji.get(reaction.emoji) ?? { emoji: reaction.emoji, count: 0, userIds: [], includesOwn: false };
    summary.count += 1;
    summary.userIds.push(reaction.userId);
    summary.includesOwn ||= reaction.userId === currentUserId;
    byEmoji.set(reaction.emoji, summary);
  }
  return [...byEmoji.values()];
}

export function reactorName(userId: string, participants: readonly RoomParticipant[], currentUserId: string | undefined): string {
  const participant = participants.find((entry) => entry.id === userId);
  return getDisplayName(userId, participant?.nickname ?? '', currentUserId, !participant);
}

export interface GroupReaction extends MessageReaction {
  messageId: string;
}

export function mergeGroupReactions(messages: readonly { id: string; reactions?: MessageReaction[] | undefined }[]): GroupReaction[] {
  const latestByUser = new Map<string, GroupReaction>();
  for (const message of messages) {
    for (const reaction of message.reactions ?? []) {
      const current = latestByUser.get(reaction.userId);
      if (!current || reaction.updatedAt >= current.updatedAt) {
        latestByUser.set(reaction.userId, { ...reaction, messageId: message.id });
      }
    }
  }
  return [...latestByUser.values()].sort((left, right) => (left.updatedAt < right.updatedAt ? -1 : left.updatedAt > right.updatedAt ? 1 : 0));
}
