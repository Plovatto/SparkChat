import { BoundedMap } from '@lib/cache/bounded-map';
import type { Language } from '@lib/i18n/language';

// Memory only, by design: room keys sit in plain text in IndexedDB, so persisting
// translated message text would expose it offline. Never write this to any storage.
export const TRANSLATION_CACHE_SIZE = 500;

export type CachedTranslation = { status: 'translated'; text: string; sourceLanguage: Language } | { status: 'none' };

type Entry = { value: CachedTranslation; roomId: string; messageIndexKey: string };

const roomIndex = new Map<string, Set<string>>();
const messageIndex = new Map<string, Set<string>>();

function messageIndexKeyOf(roomId: string, messageId: string): string {
  return `${roomId}\u0000${messageId}`;
}

function removeFromIndex(index: Map<string, Set<string>>, indexKey: string, cacheKey: string): void {
  const keys = index.get(indexKey);
  if (!keys) {
    return;
  }
  keys.delete(cacheKey);
  if (keys.size === 0) {
    index.delete(indexKey);
  }
}

const entries = new BoundedMap<string, Entry>(TRANSLATION_CACHE_SIZE, (entry, cacheKey) => {
  removeFromIndex(roomIndex, entry.roomId, cacheKey);
  removeFromIndex(messageIndex, entry.messageIndexKey, cacheKey);
});

function addToIndex(index: Map<string, Set<string>>, indexKey: string, cacheKey: string): void {
  const keys = index.get(indexKey);
  if (keys) {
    keys.add(cacheKey);
  } else {
    index.set(indexKey, new Set([cacheKey]));
  }
}

// 32-bit FNV-1a over UTF-16 code units, as 8 hex digits.
function fnv1a32(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function translationCacheKey(input: {
  roomId: string;
  messageId: string;
  field: 'content' | 'caption';
  target: Language;
  sourceText: string;
}): string {
  return `${input.roomId}:${input.messageId}:${input.field}:${input.target}:${fnv1a32(input.sourceText)}`;
}

export function readTranslation(key: string): CachedTranslation | undefined {
  return entries.get(key)?.value;
}

/** The key must come from translationCacheKey so its first two segments are roomId and messageId. */
export function writeTranslation(key: string, value: CachedTranslation): void {
  const [roomId = '', messageId = ''] = key.split(':');
  const messageIndexKey = messageIndexKeyOf(roomId, messageId);
  entries.set(key, { value, roomId, messageIndexKey });
  addToIndex(roomIndex, roomId, key);
  addToIndex(messageIndex, messageIndexKey, key);
}

function dropKeys(keys: Set<string> | undefined): void {
  if (!keys) {
    return;
  }
  for (const key of [...keys]) {
    entries.delete(key);
  }
}

export function forgetTranslation(roomId: string, messageId: string): void {
  dropKeys(messageIndex.get(messageIndexKeyOf(roomId, messageId)));
}

export function clearTranslationsForRoom(roomId: string): void {
  dropKeys(roomIndex.get(roomId));
}

export function clearTranslationCache(): void {
  entries.clear();
  roomIndex.clear();
  messageIndex.clear();
}

export function getTranslationCacheSizeForTests(what: 'entries' | 'indexes' = 'entries'): number {
  if (what === 'indexes') {
    return roomIndex.size + messageIndex.size;
  }
  let count = 0;
  for (const keys of roomIndex.values()) {
    count += keys.size;
  }
  return count;
}
