import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_INDEXED_DB_NAMES, clearLocalAccountData, deleteIndexedDatabase } from './clear-local-account-data';

const calls = vi.hoisted(() => [] as string[]);

vi.mock('@lib/e2ee', () => ({
  clearIdentity: () =>
    new Promise<void>((resolve) =>
      setTimeout(() => {
        calls.push('clearIdentity');
        resolve();
      }, 5),
    ),
  clearRoomKeys: () =>
    new Promise<void>((resolve) =>
      setTimeout(() => {
        calls.push('clearRoomKeys');
        resolve();
      }, 5),
    ),
}));

vi.mock('@features/gifs/utils/gif-media-cache', () => ({ clearGifMediaCache: () => calls.push('clearGifMediaCache') }));
vi.mock('@features/gifs/utils/gif-status-cache', () => ({ clearGifStatusCache: () => calls.push('clearGifStatusCache') }));

class MemoryStorage {
  private readonly data = new Map<string, string>();
  get length(): number {
    return this.data.size;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  keys(): string[] {
    return [...this.data.keys()].sort();
  }
}

type FakeRequest = { onsuccess: (() => void) | null; onerror: (() => void) | null; onblocked: (() => void) | null };

function stubIndexedDb(outcome: 'success' | 'blocked' | 'never') {
  const deleteDatabase = vi.fn((name: string) => {
    const request: FakeRequest = { onsuccess: null, onerror: null, onblocked: null };
    setTimeout(() => {
      calls.push(`delete:${name}`);
      if (outcome === 'success') request.onsuccess?.();
      if (outcome === 'blocked') request.onblocked?.();
    }, 0);
    return request;
  });
  vi.stubGlobal('indexedDB', { deleteDatabase });
  return deleteDatabase;
}

let storage: MemoryStorage;

beforeEach(() => {
  calls.length = 0;
  storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('clearLocalAccountData', () => {
  it('waits for the key wipes before deleting the account databases', async () => {
    const deleteDatabase = stubIndexedDb('success');
    await clearLocalAccountData();
    expect(deleteDatabase.mock.calls.map(([name]) => name)).toEqual([...ACCOUNT_INDEXED_DB_NAMES]);
    expect(ACCOUNT_INDEXED_DB_NAMES).toEqual(['sparkchat-e2ee', 'sparkchat-recovery-files', 'sparkchat-notify']);
    expect(calls.slice(0, 2).sort()).toEqual(['clearGifMediaCache', 'clearGifStatusCache']);
    expect(calls.slice(2, 4).sort()).toEqual(['clearIdentity', 'clearRoomKeys']);
    expect(calls.slice(4).sort()).toEqual(['delete:sparkchat-e2ee', 'delete:sparkchat-notify', 'delete:sparkchat-recovery-files']);
  });

  it('removes account and room keys but keeps device preferences', async () => {
    stubIndexedDb('success');
    const entries = {
      'sparkchat:session': '{}',
      'sparkchat:last-room:u1': 'r1',
      'sparkchat:auto-translate': '[]',
      'sparkchat:future-user-key': 'x',
      chatThemePendingSync: '1',
      'sparkchat:language': 'en',
      'sparkchat:landing-theme': '{}',
      'sparkchat:login-dark-mode': 'true',
      'sparkchat:native-translation-stalled': '{}',
      chatBaseTheme: 'dark',
    };
    for (const [key, value] of Object.entries(entries)) storage.setItem(key, value);

    await clearLocalAccountData();

    expect(storage.keys()).toEqual([
      'chatBaseTheme',
      'sparkchat:landing-theme',
      'sparkchat:language',
      'sparkchat:login-dark-mode',
      'sparkchat:native-translation-stalled',
    ]);
  });
});

describe('deleteIndexedDatabase', () => {
  it('resolves when the deletion is blocked by another open connection', async () => {
    stubIndexedDb('blocked');
    await expect(deleteIndexedDatabase('sparkchat-e2ee')).resolves.toBeUndefined();
  });

  it('never hangs logout when the browser does not answer', async () => {
    vi.useFakeTimers();
    stubIndexedDb('never');
    const pending = deleteIndexedDatabase('sparkchat-e2ee', 50);
    await vi.advanceTimersByTimeAsync(60);
    await expect(pending).resolves.toBeUndefined();
  });

  it('resolves when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(deleteIndexedDatabase('sparkchat-e2ee')).resolves.toBeUndefined();
  });
});
