import { beforeEach, describe, expect, it } from 'vitest';
import { resetTabDeviceForTests, tabDeviceToken } from './tab-device';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    clear: () => values.clear(),
    key: () => null,
    get length() {
      return values.size;
    },
  };
}

describe('tab device token', () => {
  beforeEach(() => resetTabDeviceForTests());

  it('keeps one url safe token per tab across reloads of the same tab', () => {
    const storage = memoryStorage();
    const first = tabDeviceToken(storage);
    expect(first).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    resetTabDeviceForTests();
    expect(tabDeviceToken(storage)).toBe(first);
  });

  it('gives another tab its own token and survives storage that throws', () => {
    const first = tabDeviceToken(memoryStorage());
    resetTabDeviceForTests();
    expect(tabDeviceToken(memoryStorage())).not.toBe(first);

    resetTabDeviceForTests();
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } } as unknown as Storage;
    const token = tabDeviceToken(broken);
    expect(tabDeviceToken(broken)).toBe(token);
  });
});
