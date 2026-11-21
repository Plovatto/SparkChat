import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECENT_EMOJIS_LIMIT, RECENT_EMOJIS_STORAGE_KEY, readRecentEmojis, recordRecentEmoji, withRecentEmoji } from './recent-emojis';

const GRIN = '\u{1F600}';
const THUMBS = '\u{1F44D}';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, String(value));
    },
  };
}

describe('recent emojis', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { localStorage: memoryStorage() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts empty and keeps the most recent emoji first without duplicates', () => {
    expect(readRecentEmojis()).toEqual([]);
    recordRecentEmoji(GRIN);
    recordRecentEmoji(THUMBS);
    expect(recordRecentEmoji(GRIN)).toEqual([GRIN, THUMBS]);
    expect(readRecentEmojis()).toEqual([GRIN, THUMBS]);
  });

  it('caps the list', () => {
    const many = Array.from({ length: RECENT_EMOJIS_LIMIT + 5 }, (_, index) => String.fromCodePoint(0x1f600 + index));
    let list: string[] = [];
    for (const emoji of many) {
      list = withRecentEmoji(list, emoji);
    }
    expect(list).toHaveLength(RECENT_EMOJIS_LIMIT);
    expect(list[0]).toBe(many[many.length - 1]);
  });

  it('ignores corrupted storage values', () => {
    window.localStorage.setItem(RECENT_EMOJIS_STORAGE_KEY, '{not json');
    expect(readRecentEmojis()).toEqual([]);
    window.localStorage.setItem(RECENT_EMOJIS_STORAGE_KEY, JSON.stringify({ a: 1 }));
    expect(readRecentEmojis()).toEqual([]);
    window.localStorage.setItem(RECENT_EMOJIS_STORAGE_KEY, JSON.stringify([GRIN, 42, '', 'x'.repeat(100), GRIN]));
    expect(readRecentEmojis()).toEqual([GRIN]);
  });

  it('survives storage that throws on access or write', () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new Error('blocked');
      },
    });
    expect(readRecentEmojis()).toEqual([]);
    expect(recordRecentEmoji(GRIN)).toEqual([GRIN]);

    const failing = memoryStorage();
    failing.setItem = () => {
      throw new Error('quota');
    };
    vi.stubGlobal('window', { localStorage: failing });
    expect(recordRecentEmoji(THUMBS)).toEqual([THUMBS]);
  });
});
