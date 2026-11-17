import { beforeEach, describe, expect, it } from 'vitest';
import {
  captureTranslationEpoch,
  clearTranslationCache,
  clearTranslationsForRoom,
  forgetTranslation,
  getTranslationCacheSizeForTests,
  isTranslationEpochCurrent,
  readTranslation,
  TRANSLATION_CACHE_SIZE,
  TRANSLATION_EPOCH_TRACK_SIZE,
  translationCacheKey,
  writeTranslation,
} from './translation-cache';

const base = { field: 'content', target: 'pt', sourceText: 'hello' } as const;
const key = (roomId: string, messageId: string, extra: Partial<Parameters<typeof translationCacheKey>[0]> = {}) =>
  translationCacheKey({ ...base, roomId, messageId, ...extra });
const value = { status: 'translated', text: 'ola', sourceLanguage: 'en' } as const;

describe('translation cache', () => {
  beforeEach(() => clearTranslationCache());

  it('does not reuse a translation when the source text changed', () => {
    const k1 = key('r', 'm', { sourceText: 'Encrypted message unavailable' });
    const k2 = key('r', 'm', { sourceText: 'good morning' });
    expect(k1).not.toBe(k2);
  });

  it('reads back what was written', () => {
    writeTranslation(key('r', 'm'), value);
    expect(readTranslation(key('r', 'm'))).toEqual(value);
    writeTranslation(key('r', 'n'), { status: 'none' });
    expect(readTranslation(key('r', 'n'))).toEqual({ status: 'none' });
  });

  it('forgets a deleted message in every field and language', () => {
    const a = key('r', 'm', { field: 'content', target: 'pt' });
    const b = key('r', 'm', { field: 'caption', target: 'en' });
    const c = key('r', 'm2');
    writeTranslation(a, value);
    writeTranslation(b, value);
    writeTranslation(c, value);
    forgetTranslation('r', 'm');
    expect(readTranslation(a)).toBeUndefined();
    expect(readTranslation(b)).toBeUndefined();
    expect(readTranslation(c)).toEqual(value);
  });

  it('clears one room only', () => {
    writeTranslation(key('r1', 'm'), value);
    writeTranslation(key('r2', 'm'), value);
    clearTranslationsForRoom('r1');
    expect(readTranslation(key('r1', 'm'))).toBeUndefined();
    expect(readTranslation(key('r2', 'm'))).toEqual(value);
  });

  it('clears everything on logout', () => {
    writeTranslation(key('r1', 'm'), value);
    writeTranslation(key('r2', 'm'), value);
    clearTranslationCache();
    expect(readTranslation(key('r1', 'm'))).toBeUndefined();
    expect(readTranslation(key('r2', 'm'))).toBeUndefined();
    expect(getTranslationCacheSizeForTests()).toBe(0);
  });

  it('evicts beyond TRANSLATION_CACHE_SIZE and cleans secondary indexes', () => {
    for (let i = 0; i <= TRANSLATION_CACHE_SIZE; i += 1) {
      writeTranslation(key('r', `m${i}`), value);
    }
    expect(readTranslation(key('r', 'm0'))).toBeUndefined();
    expect(readTranslation(key('r', `m${TRANSLATION_CACHE_SIZE}`))).toEqual(value);
    expect(getTranslationCacheSizeForTests()).toBe(TRANSLATION_CACHE_SIZE);
    expect(getTranslationCacheSizeForTests('indexes')).toBe(TRANSLATION_CACHE_SIZE + 1);
  });

  it.each([
    ['a:b', 'm:1'],
    ['50%', '100%25'],
  ])('handles ids with special characters (%s, %s)', (roomId, messageId) => {
    const k = key(roomId, messageId);
    const other = key('other', 'm');
    const otherMsg = key(roomId, 'm2');
    writeTranslation(k, value);
    writeTranslation(other, value);
    writeTranslation(otherMsg, value);
    forgetTranslation(roomId, messageId);
    expect(readTranslation(k)).toBeUndefined();
    expect(readTranslation(other)).toEqual(value);
    expect(readTranslation(otherMsg)).toEqual(value);
    writeTranslation(k, value);
    clearTranslationsForRoom(roomId);
    expect(readTranslation(k)).toBeUndefined();
    expect(readTranslation(otherMsg)).toBeUndefined();
    expect(readTranslation(other)).toEqual(value);
  });

  it('leaves no index entries after clearing', () => {
    writeTranslation(key('r', 'm'), value);
    clearTranslationsForRoom('r');
    expect(getTranslationCacheSizeForTests('indexes')).toBe(0);
  });
});

describe('translation epochs', () => {
  beforeEach(() => clearTranslationCache());

  it('stays current while nothing is cleared', () => {
    const epoch = captureTranslationEpoch('r', 'm');
    writeTranslation(key('r', 'other'), value);
    expect(isTranslationEpochCurrent(epoch)).toBe(true);
  });

  it('goes stale when the message is forgotten, but not for other messages', () => {
    const epoch = captureTranslationEpoch('r', 'm');
    const sibling = captureTranslationEpoch('r', 'n');
    forgetTranslation('r', 'm');
    expect(isTranslationEpochCurrent(epoch)).toBe(false);
    expect(isTranslationEpochCurrent(sibling)).toBe(true);
    expect(isTranslationEpochCurrent(captureTranslationEpoch('r', 'm'))).toBe(true);
  });

  it('goes stale when the room is cleared, but not for other rooms', () => {
    const epoch = captureTranslationEpoch('r', 'm');
    const otherRoom = captureTranslationEpoch('r2', 'm');
    clearTranslationsForRoom('r');
    expect(isTranslationEpochCurrent(epoch)).toBe(false);
    expect(isTranslationEpochCurrent(otherRoom)).toBe(true);
  });

  it('goes stale for everyone on logout and drops the per-scope stamps', () => {
    forgetTranslation('r', 'x');
    clearTranslationsForRoom('r3');
    const epoch = captureTranslationEpoch('r2', 'm');
    clearTranslationCache();
    expect(isTranslationEpochCurrent(epoch)).toBe(false);
    expect(getTranslationCacheSizeForTests('epochs')).toBe(0);
    expect(isTranslationEpochCurrent(captureTranslationEpoch('r', 'x'))).toBe(true);
  });

  it('keeps the stamp maps bounded and stays on the safe side after eviction', () => {
    const epoch = captureTranslationEpoch('r', 'm0');
    for (let i = 0; i <= TRANSLATION_EPOCH_TRACK_SIZE; i += 1) {
      forgetTranslation('r', `m${i}`);
    }
    expect(getTranslationCacheSizeForTests('epochs')).toBe(TRANSLATION_EPOCH_TRACK_SIZE);
    // m0's stamp was evicted, yet the old epoch still reads as stale
    expect(isTranslationEpochCurrent(epoch)).toBe(false);
  });
});
