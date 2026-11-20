import { PWA_INSTALL_CARD_DISMISSED_STORAGE_KEY } from '@constants/storage-keys';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallSnapshot {
  canPrompt: boolean;
  isIos: boolean;
  isStandalone: boolean;
  installed: boolean;
  sheetOpen: boolean;
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

interface PlatformInfo {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}

interface DisplayInfo {
  matchMedia?: (query: string) => { matches: boolean };
  navigatorStandalone?: boolean;
}

const STANDALONE_QUERIES = ['(display-mode: standalone)', '(display-mode: fullscreen)', '(display-mode: minimal-ui)', '(display-mode: window-controls-overlay)'];

export function isIosPlatform({ userAgent, platform = '', maxTouchPoints = 0 }: PlatformInfo): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return true;
  }
  return (platform === 'MacIntel' || /Macintosh/i.test(userAgent)) && maxTouchPoints > 1;
}

export function isStandaloneDisplay({ matchMedia, navigatorStandalone }: DisplayInfo): boolean {
  if (navigatorStandalone === true) {
    return true;
  }
  return Boolean(matchMedia && STANDALONE_QUERIES.some((query) => matchMedia(query).matches));
}

function hasWindow(): boolean {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined';
}

function detectIos(): boolean {
  if (!hasWindow()) {
    return false;
  }
  return isIosPlatform({ userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints });
}

function detectStandalone(): boolean {
  if (!hasWindow()) {
    return false;
  }
  return isStandaloneDisplay({
    matchMedia: typeof window.matchMedia === 'function' ? (query) => window.matchMedia(query) : undefined,
    navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone,
  });
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
let sheetOpen = false;
let snapshot: InstallSnapshot = buildSnapshot();
const listeners = new Set<() => void>();

function buildSnapshot(): InstallSnapshot {
  return { canPrompt: deferredPrompt !== null, isIos: detectIos(), isStandalone: detectStandalone(), installed, sheetOpen };
}

function notify(): void {
  snapshot = buildSnapshot();
  listeners.forEach((listener) => listener());
}

export function getInstallSnapshot(): InstallSnapshot {
  return snapshot;
}

export function subscribeInstallState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isInstallAvailable(state: InstallSnapshot): boolean {
  return !state.isStandalone && !state.installed && (state.canPrompt || state.isIos);
}

export function needsIosInstall(state: Pick<InstallSnapshot, 'isIos' | 'isStandalone'>): boolean {
  return state.isIos && !state.isStandalone;
}

export function captureInstallPrompt(target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window): () => void {
  const handlePrompt = (event: Event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  };
  const handleInstalled = () => {
    deferredPrompt = null;
    installed = true;
    sheetOpen = false;
    notify();
  };
  target.addEventListener('beforeinstallprompt', handlePrompt);
  target.addEventListener('appinstalled', handleInstalled);
  return () => {
    target.removeEventListener('beforeinstallprompt', handlePrompt);
    target.removeEventListener('appinstalled', handleInstalled);
  };
}

export async function promptInstall(): Promise<InstallOutcome> {
  const event = deferredPrompt;
  if (!event) {
    return 'unavailable';
  }
  deferredPrompt = null;
  notify();
  try {
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === 'accepted') {
      installed = true;
      sheetOpen = false;
      notify();
    }
    return choice.outcome;
  } catch {
    return 'unavailable';
  }
}

export function openInstallSheet(): void {
  sheetOpen = true;
  notify();
}

export function closeInstallSheet(): void {
  sheetOpen = false;
  notify();
}

export function requestInstall(): Promise<InstallOutcome> {
  if (deferredPrompt) {
    return promptInstall();
  }
  openInstallSheet();
  return Promise.resolve('unavailable');
}

export function refreshInstallState(): void {
  notify();
}

export function isInstallCardDismissed(): boolean {
  try {
    return localStorage.getItem(PWA_INSTALL_CARD_DISMISSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function dismissInstallCard(): void {
  try {
    localStorage.setItem(PWA_INSTALL_CARD_DISMISSED_STORAGE_KEY, 'true');
  } catch {
    return;
  }
}

export function resetInstallStateForTests(): void {
  deferredPrompt = null;
  installed = false;
  sheetOpen = false;
  listeners.clear();
  notify();
}
