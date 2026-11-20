import { PWA_IOS_INSTALL_SNOOZE_STORAGE_KEY, PWA_NOTIFICATIONS_SNOOZE_STORAGE_KEY } from '@constants/storage-keys';

export const ONBOARDING_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export type OnboardingPrompt = 'notifications' | 'ios-install' | 'install' | null;

export interface OnboardingInput {
  notificationsSupported: boolean;
  permission: NotificationPermission;
  iosNeedsInstall: boolean;
  installAvailable: boolean;
  installCardDismissed: boolean;
  notificationsSnoozedUntil: number;
  iosInstallSnoozedUntil: number;
  now: number;
}

export function chooseOnboardingPrompt(input: OnboardingInput): OnboardingPrompt {
  if (input.iosNeedsInstall) {
    return input.now >= input.iosInstallSnoozedUntil ? 'ios-install' : null;
  }
  if (input.notificationsSupported && input.permission === 'default' && input.now >= input.notificationsSnoozedUntil) {
    return 'notifications';
  }
  if (input.installAvailable && !input.installCardDismissed) {
    return 'install';
  }
  return null;
}

function readTimestamp(key: string): number {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeSnooze(key: string, now: number): void {
  try {
    localStorage.setItem(key, String(now + ONBOARDING_SNOOZE_MS));
  } catch {
    return;
  }
}

export function notificationsSnoozedUntil(): number {
  return readTimestamp(PWA_NOTIFICATIONS_SNOOZE_STORAGE_KEY);
}

export function snoozeNotificationsPrompt(now = Date.now()): void {
  writeSnooze(PWA_NOTIFICATIONS_SNOOZE_STORAGE_KEY, now);
}

export function iosInstallSnoozedUntil(): number {
  return readTimestamp(PWA_IOS_INSTALL_SNOOZE_STORAGE_KEY);
}

export function snoozeIosInstallPrompt(now = Date.now()): void {
  writeSnooze(PWA_IOS_INSTALL_SNOOZE_STORAGE_KEY, now);
}
