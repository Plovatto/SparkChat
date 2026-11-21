export const RECENT_EMOJIS_STORAGE_KEY = 'sparkchat:recent-emojis';
export const RECENT_EMOJIS_LIMIT = 24;
const MAX_EMOJI_LENGTH = 32;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isEmojiCandidate(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_EMOJI_LENGTH;
}

export function readRecentEmojis(): string[] {
  try {
    const raw = storage()?.getItem(RECENT_EMOJIS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return [...new Set(parsed.filter(isEmojiCandidate))].slice(0, RECENT_EMOJIS_LIMIT);
  } catch {
    return [];
  }
}

export function withRecentEmoji(recents: readonly string[], emoji: string): string[] {
  return [emoji, ...recents.filter((item) => item !== emoji)].slice(0, RECENT_EMOJIS_LIMIT);
}

export function recordRecentEmoji(emoji: string): string[] {
  const next = isEmojiCandidate(emoji) ? withRecentEmoji(readRecentEmojis(), emoji) : readRecentEmojis();
  try {
    storage()?.setItem(RECENT_EMOJIS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    return next;
  }
  return next;
}
