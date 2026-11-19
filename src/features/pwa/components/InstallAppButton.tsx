import { useTranslation } from 'react-i18next';
import { FaDownload } from 'react-icons/fa';
import { useInstallState } from '../hooks/useInstallState';
import { isInstallAvailable, requestInstall } from '../lib/install-state';

interface InstallAppButtonProps {
  className?: string;
}

export function InstallAppButton({ className = 'sc-icon-btn sc-icon-btn--header sidebar-header-btn' }: InstallAppButtonProps) {
  const { t } = useTranslation();
  const install = useInstallState();

  if (!isInstallAvailable(install)) {
    return null;
  }

  const label = t('pwa.installApp');

  return (
    <button type="button" onClick={() => void requestInstall()} title={label} aria-label={label} className={className}>
      <FaDownload size={15} />
    </button>
  );
}
