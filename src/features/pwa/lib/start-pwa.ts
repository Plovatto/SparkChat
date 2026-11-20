import { appI18n, currentLanguage } from '@lib/i18n/app-i18n';
import { captureInstallPrompt, getInstallSnapshot, openInstallSheet } from './install-state';
import { captureLaunchIntent } from './launch-params';
import { applyManifestLanguage } from './manifest-language';
import { postToWorker, startServiceWorker } from './sw-registration';

function syncLanguage(): void {
  const language = currentLanguage();
  applyManifestLanguage(document, language);
  if (import.meta.env.PROD) {
    postToWorker({ type: 'sparkchat:locale', language });
  }
}

export function startPwa(): void {
  if (typeof window === 'undefined') {
    return;
  }
  applyManifestLanguage(document, currentLanguage());
  appI18n.on('languageChanged', syncLanguage);
  captureInstallPrompt(window);
  const launch = captureLaunchIntent();
  if (launch.install && !getInstallSnapshot().isStandalone) {
    openInstallSheet();
  }
  startServiceWorker();
  syncLanguage();
}
