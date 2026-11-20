import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomSummary } from '@lib/socket';
import type * as KeyStoreNamespace from '../../../lib/e2ee/key-store';
import { buildNotificationDisplayNames } from './notification-display-names';
import type * as MirrorNamespace from './notification-mirror';

async function fresh(): Promise<{ mirror: typeof MirrorNamespace; keyStore: typeof KeyStoreNamespace }> {
  vi.resetModules();
  return { mirror: await import('./notification-mirror'), keyStore: await import('../../../lib/e2ee/key-store') };
}

function rawRecord(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('sparkchat-notify', 1);
    request.onsuccess = () => {
      const get = request.result.transaction('kv', 'readonly').objectStore('kv').get('current');
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error ?? new Error('read failed'));
    };
    request.onerror = () => reject(request.error ?? new Error('open failed'));
  });
}

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
});

const names = { users: { u2: 'Ana' }, groups: { g1: 'Família' } };

describe('notification mirror', () => {
  it('round-trips the preference, language and names for the service worker', async () => {
    const { mirror } = await fresh();
    await mirror.writeNotificationMirror({ ownerId: 'u1', hideContent: false, language: 'en', names });
    expect(await mirror.readNotificationMirror()).toEqual({ ownerId: 'u1', hideContent: false, language: 'en', names });
  });

  it('keeps names encrypted at rest with the local wrapping key', async () => {
    const { mirror } = await fresh();
    await mirror.writeNotificationMirror({ ownerId: 'u1', hideContent: false, language: 'pt', names });
    const raw = JSON.stringify(await rawRecord(), (_key, value: unknown) => (value instanceof Uint8Array ? Array.from(value) : value));
    expect(raw).not.toContain('Ana');
    expect(raw).not.toContain('Família');
  });

  it('loses the names once the wrapping key is wiped on logout', async () => {
    const { mirror, keyStore } = await fresh();
    await mirror.writeNotificationMirror({ ownerId: 'u1', hideContent: false, language: 'pt', names });
    await keyStore.clearWrappingKey();
    keyStore.forgetCachedWrappingKey();
    expect((await mirror.readNotificationMirror())?.names).toEqual({ users: {}, groups: {} });
  });

  it('reads nothing before the app wrote it and after it was cleared', async () => {
    const { mirror } = await fresh();
    expect(await mirror.readNotificationMirror()).toBeNull();
    await mirror.writeNotificationMirror({ ownerId: 'u1', hideContent: true, language: 'pt', names });
    expect((await mirror.readNotificationMirror())?.hideContent).toBe(true);
    await mirror.clearNotificationMirror();
    expect(await mirror.readNotificationMirror()).toBeNull();
  });
});

describe('notification mirror light reads', () => {
  it('reads the language without unwrapping anything', async () => {
    const { mirror } = await fresh();
    expect(await mirror.readNotificationLanguage()).toBeNull();
    await mirror.writeNotificationMirror({ ownerId: 'u1', hideContent: false, language: 'en', names });
    expect(await mirror.readNotificationLanguage()).toBe('en');
  });

  it('remembers message ids once and keeps only the most recent ones', async () => {
    const { mirror } = await fresh();
    expect(await mirror.rememberMessageId('m-0')).toBe(true);
    expect(await mirror.rememberMessageId('m-0')).toBe(false);
    for (let index = 1; index <= mirror.SEEN_MESSAGE_LIMIT; index += 1) {
      expect(await mirror.rememberMessageId(`m-${index}`)).toBe(true);
    }
    expect(await mirror.rememberMessageId(`m-${mirror.SEEN_MESSAGE_LIMIT}`)).toBe(false);
    expect(await mirror.rememberMessageId('m-0')).toBe(true);
  });
});

describe('buildNotificationDisplayNames', () => {
  it('collects other participants and named groups only', () => {
    const rooms = [
      { id: 'r1', type: 'private', participants: [{ id: 'u1', nickname: 'Eu' }, { id: 'u2', nickname: 'Ana' }] },
      { id: 'g1', type: 'group', name: 'Família', participants: [{ id: 'u1', nickname: 'Eu' }, { id: 'u3', nickname: 'Bia' }] },
      { id: 'g2', type: 'group', participants: [{ id: 'u4', nickname: 'Caio' }] },
    ] as unknown as RoomSummary[];
    expect(buildNotificationDisplayNames(rooms, 'u1')).toEqual({ users: { u2: 'Ana', u3: 'Bia', u4: 'Caio' }, groups: { g1: 'Família' } });
  });
});
