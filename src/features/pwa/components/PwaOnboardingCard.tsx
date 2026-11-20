import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaBell, FaDownload } from 'react-icons/fa';
import { useInstallState } from '../hooks/useInstallState';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { dismissInstallCard, isInstallAvailable, isInstallCardDismissed, needsIosInstall, openInstallSheet, requestInstall } from '../lib/install-state';
import {
  chooseOnboardingPrompt,
  iosInstallSnoozedUntil,
  notificationsSnoozedUntil,
  snoozeIosInstallPrompt,
  snoozeNotificationsPrompt,
} from '../lib/onboarding';
import { isNotificationSupported, isPushSupported } from '../lib/push-subscription';
import { PwaPromptCard, type PwaPromptCardProps } from './PwaPromptCard';
import { PWA_CARD_EXIT_MS, useRetainedPresence } from '../hooks/useRetainedPresence';
import '../styles/pwa.css';

interface PwaOnboardingCardProps {
  onNotificationsGranted: () => void;
}

export function PwaOnboardingCard({ onNotificationsGranted }: PwaOnboardingCardProps) {
  const { t } = useTranslation();
  const install = useInstallState();
  const push = usePushNotifications();
  const [hidden, setHidden] = useState(false);
  const [notificationsHandled, setNotificationsHandled] = useState(false);
  const [now] = useState(() => Date.now());
  const [snoozes] = useState(() => ({
    notifications: notificationsSnoozedUntil(),
    iosInstall: iosInstallSnoozedUntil(),
    installDismissed: isInstallCardDismissed(),
  }));

  const prompt = hidden
    ? null
    : chooseOnboardingPrompt({
        notificationsSupported: isNotificationSupported(),
        permission: notificationsHandled ? 'granted' : push.permission,
        iosNeedsInstall: needsIosInstall(install),
        installAvailable: isInstallAvailable(install),
        installCardDismissed: snoozes.installDismissed,
        notificationsSnoozedUntil: snoozes.notifications,
        iosInstallSnoozedUntil: snoozes.iosInstall,
        now,
      });

  useEffect(() => {
    if (prompt === 'ios-install') {
      snoozeIosInstallPrompt();
      setHidden(true);
      openInstallSheet();
    }
  }, [prompt]);

  let card: (PwaPromptCardProps & { kind: 'notifications' | 'install' }) | null = null;
  if (prompt === 'notifications') {
    card = {
      kind: 'notifications',
      icon: <FaBell size={16} />,
      title: t('pwa.card.notificationsTitle'),
      text: t('pwa.card.notificationsText'),
      primaryLabel: t('pwa.card.enable'),
      onPrimary: () => {
        const request = isPushSupported() ? push.enable() : Notification.requestPermission();
        void request.then((permission) => {
          if (permission === 'granted') {
            onNotificationsGranted();
          }
          if (permission !== 'default') {
            setNotificationsHandled(true);
          }
        });
      },
      secondaryLabel: t('pwa.notNow'),
      onSecondary: () => {
        snoozeNotificationsPrompt();
        setNotificationsHandled(true);
      },
      busy: push.busy,
    };
  } else if (prompt === 'install') {
    card = {
      kind: 'install',
      icon: <FaDownload size={15} />,
      title: t('pwa.card.installTitle'),
      text: t('pwa.card.installText'),
      primaryLabel: install.isIos ? t('pwa.card.iosInstallAction') : t('pwa.install'),
      onPrimary: () => void requestInstall(),
      secondaryLabel: t('pwa.notNow'),
      onSecondary: () => {
        dismissInstallCard();
        setHidden(true);
      },
    };
  }

  const presence = useRetainedPresence(card, PWA_CARD_EXIT_MS);
  if (!presence.isPresent || !presence.value) {
    return null;
  }
  const { kind, ...cardProps } = presence.value;

  return (
    <div className={`pwa-card-shell${presence.isExiting ? ' is-exiting' : ''}`} aria-hidden={presence.isExiting || undefined}>
      <div className="pwa-card-shell__inner">
        <PwaPromptCard key={kind} {...cardProps} />
      </div>
    </div>
  );
}
