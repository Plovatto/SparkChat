import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as InviteFragmentNamespace from './invite-fragment';

const LINK_HASH = '#join=7b0c3f4e-2a51-4c1d-9d0e-5f6a7b8c9d0e.AAECAwQFBgcICQoLDA0ODw';

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
  it('strips the fragment from the url right away and keeps it in memory once', () => {
    const fake = fakeWindow(LINK_HASH, '?apresentacao=1');
    vi.stubGlobal('window', fake.window);

    expect(module.captureInviteFragment()).toBe(true);
    expect(fake.replaceState).toHaveBeenCalledWith(null, '', '/app/?apresentacao=1');
    expect(fake.location.hash).toBe('');
    expect(module.takeInviteFragment()).toBe(LINK_HASH);
    expect(module.takeInviteFragment()).toBeNull();
  });

  it('leaves urls without an invite untouched', () => {
    const fake = fakeWindow('#section');
    vi.stubGlobal('window', fake.window);

    expect(module.captureInviteFragment()).toBe(false);
    expect(fake.replaceState).not.toHaveBeenCalled();
    expect(module.takeInviteFragment()).toBeNull();
  });

  it('captures links opened later in the same tab and notifies subscribers', () => {
    const fake = fakeWindow('');
    vi.stubGlobal('window', fake.window);
    module.installInviteFragmentCapture();
    const listener = vi.fn();
    module.subscribeInviteFragment(listener);

    fake.location.hash = LINK_HASH;
    fake.listeners.get('hashchange')?.();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(fake.location.hash).toBe('');
    expect(module.takeInviteFragment()).toBe(LINK_HASH);
  });
});
