import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaDownload } from 'react-icons/fa';
import { useInstallState } from '../hooks/useInstallState';
import { isInstallAvailable, requestInstall } from '../lib/install-state';
import '../styles/pwa.css';

let hasPulsed = false;

function claimPulse(): boolean {
  if (hasPulsed) {
    return false;
  }
  hasPulsed = true;
  return true;
}

interface InstallAppButtonProps {
  className?: string;
}

function VisibleInstallButton({ className }: { className: string }) {
  const { t } = useTranslation();
  const [pulse] = useState(claimPulse);
  const label = t('pwa.installApp');

  return (
    <button type="button" onClick={() => void requestInstall()} title={label} aria-label={label} className={pulse ? `${className} pwa-install-btn` : className}>
      <FaDownload size={15} />
    </button>
  );
}

export function InstallAppButton({ className = 'sc-icon-btn sc-icon-btn--header sidebar-header-btn' }: InstallAppButtonProps) {
  const install = useInstallState();
  return isInstallAvailable(install) ? <VisibleInstallButton className={className} /> : null;
}
