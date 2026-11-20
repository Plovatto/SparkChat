import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureInstallPrompt,
  dismissInstallCard,
  getInstallSnapshot,
  isInstallAvailable,
  isInstallCardDismissed,
  isDesktopPlatform,
  isIosPlatform,
  isStandaloneDisplay,
  needsIosInstall,
  promptInstall,
  requestInstall,
  resetInstallStateForTests,
  subscribeInstallState,
  type InstallSnapshot,
} from './install-state';

function createStorage(): Storage {
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
      values.set(key, value);
    },
  };
}

function fakePromptEvent(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
  const prompt = vi.fn(() => Promise.resolve());
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome }) });
  return { event, prompt };
}

const BASE: InstallSnapshot = { canPrompt: false, isIos: false, isStandalone: false, installed: false, sheetOpen: false };

beforeEach(() => {
  vi.stubGlobal('localStorage', createStorage());
  resetInstallStateForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('platform detection', () => {
  it('treats Windows, macOS and Linux browsers as desktop but not phones or tablets', () => {
    expect(isDesktopPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36' })).toBe(true);
    expect(isDesktopPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(true);
    expect(isDesktopPlatform({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130' })).toBe(true);
    expect(isDesktopPlatform({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130 Mobile Safari/537.36' })).toBe(false);
    expect(isDesktopPlatform({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari/604.1' })).toBe(false);
    expect(isDesktopPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(false);
  });


  it('detects iPhone, iPad and iPadOS desktop mode', () => {
    expect(isIosPlatform({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari/604.1' })).toBe(true);
    expect(isIosPlatform({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)' })).toBe(true);
    expect(isIosPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
    expect(isIosPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
    expect(isIosPlatform({ userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130' })).toBe(false);
  });

  it('detects standalone through display-mode or navigator.standalone', () => {
    const media = (matching: string) => (query: string) => ({ matches: query === matching });
    expect(isStandaloneDisplay({ matchMedia: media('(display-mode: standalone)') })).toBe(true);
    expect(isStandaloneDisplay({ matchMedia: media('(display-mode: window-controls-overlay)') })).toBe(true);
    expect(isStandaloneDisplay({ matchMedia: media('(display-mode: browser)') })).toBe(false);
    expect(isStandaloneDisplay({ navigatorStandalone: true })).toBe(true);
    expect(isStandaloneDisplay({})).toBe(false);
  });
});

describe('install availability', () => {
  it('is offered when a prompt is available or on iOS, and hidden when running standalone or installed', () => {
    expect(isInstallAvailable(BASE)).toBe(false);
    expect(isInstallAvailable({ ...BASE, canPrompt: true })).toBe(true);
    expect(isInstallAvailable({ ...BASE, isIos: true })).toBe(true);
    expect(isInstallAvailable({ ...BASE, canPrompt: true, isStandalone: true })).toBe(false);
    expect(isInstallAvailable({ ...BASE, isIos: true, isStandalone: true })).toBe(false);
    expect(isInstallAvailable({ ...BASE, canPrompt: true, installed: true })).toBe(false);
  });

  it('only asks iOS to install when it is not already on the home screen', () => {
    expect(needsIosInstall({ isIos: true, isStandalone: false })).toBe(true);
    expect(needsIosInstall({ isIos: true, isStandalone: true })).toBe(false);
    expect(needsIosInstall({ isIos: false, isStandalone: false })).toBe(false);
  });
});

describe('beforeinstallprompt flow', () => {
  it('captures the event, prevents the mini infobar and prompts from a user action', async () => {
    const target = new EventTarget();
    const stop = captureInstallPrompt(target);
    const listener = vi.fn();
    subscribeInstallState(listener);
    const { event, prompt } = fakePromptEvent('accepted');

    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(getInstallSnapshot().canPrompt).toBe(true);
    expect(listener).toHaveBeenCalled();

    await expect(promptInstall()).resolves.toBe('accepted');
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(getInstallSnapshot()).toMatchObject({ canPrompt: false, installed: true });
    await expect(promptInstall()).resolves.toBe('unavailable');
    stop();
  });

  it('forgets a dismissed prompt and opens the sheet when no prompt is available', async () => {
    const target = new EventTarget();
    captureInstallPrompt(target);
    target.dispatchEvent(fakePromptEvent('dismissed').event);
    await expect(requestInstall()).resolves.toBe('dismissed');
    expect(getInstallSnapshot()).toMatchObject({ canPrompt: false, installed: false, sheetOpen: false });

    await expect(requestInstall()).resolves.toBe('unavailable');
    expect(getInstallSnapshot().sheetOpen).toBe(true);
  });

  it('marks the app installed on appinstalled', () => {
    const target = new EventTarget();
    captureInstallPrompt(target);
    target.dispatchEvent(fakePromptEvent('accepted').event);
    target.dispatchEvent(new Event('appinstalled'));
    expect(getInstallSnapshot()).toMatchObject({ canPrompt: false, installed: true });
    expect(isInstallAvailable(getInstallSnapshot())).toBe(false);
  });
});

describe('install card dismissal', () => {
  it('persists the dismissal', () => {
    expect(isInstallCardDismissed()).toBe(false);
    dismissInstallCard();
    expect(isInstallCardDismissed()).toBe(true);
  });

  it('survives blocked storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => dismissInstallCard()).not.toThrow();
    expect(isInstallCardDismissed()).toBe(false);
  });
});
