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
  // Ids are percent-encoded so ':' inside an id can never shift the segments writeTranslation parses back.
  const room = encodeURIComponent(input.roomId);
  const message = encodeURIComponent(input.messageId);
  return `${room}:${message}:${input.field}:${input.target}:${fnv1a32(input.sourceText)}`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function readTranslation(key: string): CachedTranslation | undefined {
  return entries.get(key)?.value;
}

/** The key must come from translationCacheKey so its first two segments are roomId and messageId. */
export function writeTranslation(key: string, value: CachedTranslation): void {
  const [encodedRoom = '', encodedMessage = ''] = key.split(':');
  const roomId = safeDecode(encodedRoom);
  const messageId = safeDecode(encodedMessage);
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

// Clear epochs: work that started before a clear must not write its result back (security rule 6).
// One monotonic counter; each clear stamps the scope it cleared with a new value.
export const TRANSLATION_EPOCH_TRACK_SIZE = 1000;

export type TranslationEpoch = { readonly roomId: string; readonly messageId: string; readonly at: number };

let epochCounter = 0;
let globalClearedAt = 0;
// When a stamp is evicted we can no longer tell which scope it covered, so it counts against everyone (safe side).
let evictedClearedAt = 0;
const onStampEvicted = (stamp: number) => {
  evictedClearedAt = Math.max(evictedClearedAt, stamp);
};
const roomClearedAt = new BoundedMap<string, number>(TRANSLATION_EPOCH_TRACK_SIZE, onStampEvicted);
const messageClearedAt = new BoundedMap<string, number>(TRANSLATION_EPOCH_TRACK_SIZE, onStampEvicted);

export function captureTranslationEpoch(roomId: string, messageId: string): TranslationEpoch {
  return { roomId, messageId, at: epochCounter };
}

/** False once the message, its room or the whole cache was cleared after the epoch was captured. */
export function isTranslationEpochCurrent(epoch: TranslationEpoch): boolean {
  const roomStamp = roomClearedAt.get(epoch.roomId) ?? 0;
  const messageStamp = messageClearedAt.get(messageIndexKeyOf(epoch.roomId, epoch.messageId)) ?? 0;
  return Math.max(globalClearedAt, evictedClearedAt, roomStamp, messageStamp) <= epoch.at;
}

export function forgetTranslation(roomId: string, messageId: string): void {
  epochCounter += 1;
  messageClearedAt.set(messageIndexKeyOf(roomId, messageId), epochCounter);
  dropKeys(messageIndex.get(messageIndexKeyOf(roomId, messageId)));
}

export function clearTranslationsForRoom(roomId: string): void {
  epochCounter += 1;
  roomClearedAt.set(roomId, epochCounter);
  dropKeys(roomIndex.get(roomId));
}

export function clearTranslationCache(): void {
  epochCounter += 1;
  globalClearedAt = epochCounter;
  // The global stamp covers every older room/message stamp, so they can go.
  roomClearedAt.clear();
  messageClearedAt.clear();
  evictedClearedAt = 0;
  entries.clear();
  roomIndex.clear();
  messageIndex.clear();
}

export function getTranslationCacheSizeForTests(what: 'entries' | 'indexes' | 'epochs' = 'entries'): number {
  if (what === 'indexes') {
    return roomIndex.size + messageIndex.size;
  }
  if (what === 'epochs') {
    return roomClearedAt.size + messageClearedAt.size;
  }
  return entries.size;
}
