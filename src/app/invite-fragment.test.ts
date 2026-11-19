import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as InviteFragmentNamespace from './invite-fragment';

const ROOM_ID = '7b0c3f4e-2a51-4c1d-9d0e-5f6a7b8c9d0e';
const LINK_HASH = `#join=${ROOM_ID}.AAECAwQFBgcICQoLDA0ODw`;
const SECRET = Uint8Array.from({ length: 16 }, (_, index) => index);

function fakeWindow(hash: string, search = '') {
  const location = { hash, pathname: '/app/', search };
  const listeners = new Map<string, () => void>();
  const replaceState = vi.fn((_state: unknown, _title: string, url: string) => {
    const parsed = new URL(url, 'https://spark.test');
    location.hash = parsed.hash;
    location.search = parsed.search;
  });
  return {
    location,
    listeners,
    replaceState,
    window: {
      location,
      history: { state: null, replaceState },
      addEventListener: (event: string, listener: () => void) => listeners.set(event, listener),
    },
  };
}

let module: typeof InviteFragmentNamespace;

beforeEach(async () => {
  vi.resetModules();
  module = await import('./invite-fragment');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('invite fragment capture', () => {
  it('strips the fragment from the url right away and keeps only the parsed bytes once', () => {
    const fake = fakeWindow(LINK_HASH, '?apresentacao=1');
    vi.stubGlobal('window', fake.window);

    expect(module.captureInviteFragment()).toBe(true);
    expect(fake.replaceState).toHaveBeenCalledWith(null, '', '/app/?apresentacao=1');
    expect(fake.location.hash).toBe('');
    const pending = module.takePendingInvite();
    expect(pending).toEqual({ roomId: ROOM_ID, secret: SECRET });
    expect(typeof pending).toBe('object');
    expect(module.takePendingInvite()).toBeNull();
  });

  it('marks a malformed invite fragment as invalid without keeping its text', () => {
    const fake = fakeWindow('#join=not-a-link');
    vi.stubGlobal('window', fake.window);

    expect(module.captureInviteFragment()).toBe(true);
    expect(fake.location.hash).toBe('');
    expect(module.takePendingInvite()).toBe('invalid');
  });

  it('leaves urls without an invite untouched', () => {
    const fake = fakeWindow('#section');
    vi.stubGlobal('window', fake.window);

    expect(module.captureInviteFragment()).toBe(false);
    expect(fake.replaceState).not.toHaveBeenCalled();
    expect(module.takePendingInvite()).toBeNull();
  });

  async function withControlledParse(secrets: Uint8Array[]): Promise<typeof InviteFragmentNamespace> {
    vi.resetModules();
    const queue = [...secrets];
    vi.doMock('@lib/e2ee/group-invite', () => ({
      hasInviteFragment: (hash: string) => hash.startsWith('#join='),
      parseInviteFragment: () => ({ roomId: ROOM_ID, secret: queue.shift() }),
    }));
    const loaded = await import('./invite-fragment');
    vi.doUnmock('@lib/e2ee/group-invite');
    return loaded;
  }

  it('zeroes and drops the pending invite when it is discarded', async () => {
    const held = SECRET.slice();
    const controlled = await withControlledParse([held]);
    vi.stubGlobal('window', fakeWindow(LINK_HASH).window);
    controlled.captureInviteFragment();

    controlled.discardPendingInvite();

    expect(controlled.takePendingInvite()).toBeNull();
    expect(held.every((byte) => byte === 0)).toBe(true);
  });

  it('zeroes the secret it held when a newer link replaces it and notifies subscribers', async () => {
    const first = SECRET.slice();
    const second = SECRET.slice();
    const controlled = await withControlledParse([first, second]);
    vi.stubGlobal('window', fakeWindow(LINK_HASH).window);
    controlled.installInviteFragmentCapture();
    const listener = vi.fn();
    controlled.subscribeInviteFragment(listener);

    const fake = fakeWindow(LINK_HASH);
    vi.stubGlobal('window', fake.window);
    controlled.captureInviteFragment();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(fake.location.hash).toBe('');
    expect(first.every((byte) => byte === 0)).toBe(true);
    expect(controlled.takePendingInvite()).toEqual({ roomId: ROOM_ID, secret: SECRET });
  });
});
