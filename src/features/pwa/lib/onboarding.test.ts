import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PWA_IOS_INSTALL_SNOOZE_STORAGE_KEY, PWA_NOTIFICATIONS_SNOOZE_STORAGE_KEY } from '@constants/storage-keys';
import {
  chooseOnboardingPrompt,
  iosInstallSnoozedUntil,
  notificationsSnoozedUntil,
  ONBOARDING_SNOOZE_MS,
  snoozeIosInstallPrompt,
  snoozeNotificationsPrompt,
  type OnboardingInput,
} from './onboarding';

const NOW = 1_700_000_000_000;

const AFTER_LOGIN: OnboardingInput = {
  notificationsSupported: true,
  permission: 'default',
  iosNeedsInstall: false,
  installAvailable: true,
  installCardDismissed: false,
  notificationsSnoozedUntil: 0,
  iosInstallSnoozedUntil: 0,
  now: NOW,
};

let values: Map<string, string>;

beforeEach(() => {
  values = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('chooseOnboardingPrompt', () => {
  it('shows the notifications card after login while permission is still default', () => {
    expect(chooseOnboardingPrompt(AFTER_LOGIN)).toBe('notifications');
  });

  it('never shows the notifications card when permission is granted or denied', () => {
    expect(chooseOnboardingPrompt({ ...AFTER_LOGIN, permission: 'granted' })).toBe('install');
    expect(chooseOnboardingPrompt({ ...AFTER_LOGIN, permission: 'denied' })).toBe('install');
    expect(chooseOnboardingPrompt({ ...AFTER_LOGIN, permission: 'denied', installAvailable: false })).toBeNull();
  });

  it('respects the 7 day snooze and shows the card again afterwards', () => {
    const snoozedUntil = NOW + ONBOARDING_SNOOZE_MS;
    expect(chooseOnboardingPrompt({ ...AFTER_LOGIN, notificationsSnoozedUntil: snoozedUntil, installAvailable: false })).toBeNull();
    expect(chooseOnboardingPrompt({ ...AFTER_LOGIN, notificationsSnoozedUntil: snoozedUntil, now: snoozedUntil - 1, installAvailable: false })).toBeNull();
    expect(chooseOnboardingPrompt({ ...AFTER_LOGIN, notificationsSnoozedUntil: snoozedUntil, now: snoozedUntil })).toBe('notifications');
  });

  it('shows the install sheet instead on an iPhone that has not installed the app', () => {
    expect(chooseOnboardingPrompt({ ...AFTER_LOGIN, iosNeedsInstall: true, notificationsSupported: false })).toBe('ios-install');
    expect(chooseOnboardingPrompt({ ...AFTER_LOGIN, iosNeedsInstall: true })).toBe('ios-install');
    expect(chooseOnboardingPrompt({ ...AFTER_LOGIN, iosNeedsInstall: true, iosInstallSnoozedUntil: NOW + 1 })).toBeNull();
  });

  it('shows the notifications card on an installed iPhone like everywhere else', () => {
    expect(chooseOnboardingPrompt({ ...AFTER_LOGIN, iosNeedsInstall: false, installAvailable: false })).toBe('notifications');
  });

  it('skips notifications where they are unsupported and honours the install card dismissal', () => {
    expect(chooseOnboardingPrompt({ ...AFTER_LOGIN, notificationsSupported: false })).toBe('install');
    expect(chooseOnboardingPrompt({ ...AFTER_LOGIN, notificationsSupported: false, installCardDismissed: true })).toBeNull();
  });
});

describe('snooze persistence', () => {
  it('stores a 7 day snooze per device for each prompt', () => {
    expect(notificationsSnoozedUntil()).toBe(0);
    snoozeNotificationsPrompt(NOW);
    expect(values.get(PWA_NOTIFICATIONS_SNOOZE_STORAGE_KEY)).toBe(String(NOW + ONBOARDING_SNOOZE_MS));
    expect(notificationsSnoozedUntil()).toBe(NOW + ONBOARDING_SNOOZE_MS);

    snoozeIosInstallPrompt(NOW);
    expect(values.get(PWA_IOS_INSTALL_SNOOZE_STORAGE_KEY)).toBe(String(NOW + ONBOARDING_SNOOZE_MS));
    expect(iosInstallSnoozedUntil()).toBe(NOW + ONBOARDING_SNOOZE_MS);
  });

  it('ignores garbage values', () => {
    values.set(PWA_NOTIFICATIONS_SNOOZE_STORAGE_KEY, 'soon');
    expect(notificationsSnoozedUntil()).toBe(0);
  });
});
