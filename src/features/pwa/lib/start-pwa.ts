import { captureInstallPrompt, getInstallSnapshot, openInstallSheet } from './install-state';
import { captureLaunchIntent } from './launch-params';
import { startServiceWorker } from './sw-registration';

export function startPwa(): void {
  if (typeof window === 'undefined') {
    return;
  }
  captureInstallPrompt(window);
  const launch = captureLaunchIntent();
  if (launch.install && !getInstallSnapshot().isStandalone) {
    openInstallSheet();
  }
  startServiceWorker();
}
