import { describe, expect, it } from 'vitest';
import { applyOwnReaction, canReactToMessage, findOwnReaction, nextOwnReaction, summarizeReactions } from './reactions';

const reactions = [
  { userId: 'ana', emoji: '❤️', updatedAt: '1' },
  { userId: 'me', emoji: '😂', updatedAt: '2' },
  { userId: 'bia', emoji: '❤️', updatedAt: '3' },
];

describe('reaction helpers', () => {
  it('summarizes reactions by emoji in order of first appearance', () => {
    expect(summarizeReactions(reactions, 'me')).toEqual([
      { emoji: '❤️', count: 2, userIds: ['ana', 'bia'], includesOwn: false },
      { emoji: '😂', count: 1, userIds: ['me'], includesOwn: true },
    ]);
    expect(summarizeReactions(undefined, 'me')).toEqual([]);
  });

  it('replaces, adds and removes the own reaction', () => {
    expect(findOwnReaction(reactions, 'me')).toBe('😂');
    expect(applyOwnReaction(reactions, 'me', '❤️', '9').map((reaction) => `${reaction.userId}${reaction.emoji}`)).toEqual(['ana❤️', 'bia❤️', 'me❤️']);
    expect(applyOwnReaction(reactions, 'me', null, '9').map((reaction) => reaction.userId)).toEqual(['ana', 'bia']);
    expect(applyOwnReaction(undefined, 'me', '👍', '9')).toEqual([{ userId: 'me', emoji: '👍', updatedAt: '9' }]);
  });

  it('toggles off when the same emoji is chosen again', () => {
    expect(nextOwnReaction('❤️', '❤️')).toBeNull();
    expect(nextOwnReaction('❤️', '😂')).toBe('😂');
    expect(nextOwnReaction(null, '😂')).toBe('😂');
  });

  it('allows reactions on every kind of message except system, error, deleted and unsent ones', () => {
    for (const type of ['text', 'image', 'audio', 'file'] as const) {
      expect(canReactToMessage({ type, deletedForEveryone: false })).toBe(true);
    }
    expect(canReactToMessage({ type: 'system', deletedForEveryone: false })).toBe(false);
    expect(canReactToMessage({ type: 'error', deletedForEveryone: false })).toBe(false);
    expect(canReactToMessage({ type: 'text', deletedForEveryone: true })).toBe(false);
    expect(canReactToMessage({ type: 'text', deletedForEveryone: false, pending: true })).toBe(false);
    expect(canReactToMessage({ type: 'text', deletedForEveryone: false, failed: true })).toBe(false);
  });
});
