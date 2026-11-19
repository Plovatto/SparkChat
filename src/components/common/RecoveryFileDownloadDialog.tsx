import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCheckCircle, FaDownload, FaShieldAlt } from 'react-icons/fa';
import { useTheme } from '@features/theme';
import { saveRecoveryFileWithPicker } from '@lib/recovery-file-storage';
import { Modal } from './Modal';

interface RecoveryFileDownloadDialogProps {
  isOpen: boolean;
  userId: string;
  nickname: string;
  recoveryFile: string;
  onClose: () => void;
  isFirstDownload?: boolean;
}

export function RecoveryFileDownloadDialog({
  isOpen,
  userId,
  nickname,
  recoveryFile,
  onClose,
  isFirstDownload = false,
}: RecoveryFileDownloadDialogProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [hasDownloaded, setHasDownloaded] = useState(false);

  const handleDownload = async () => {
    const saved = await saveRecoveryFileWithPicker(recoveryFile, `sparkchat-${nickname.toLowerCase()}.sparkkey`, userId);
    if (saved) {
      setHasDownloaded(true);
    }
  };

  const handleClose = () => {
    setHasDownloaded(false);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} title={t('recovery.title')} onClose={() => {}} showCloseButton={false}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <p style={{ margin: 0, fontSize: '1rem', lineHeight: 1.6, color: theme.textPrimary }}>
          {t('recovery.intro')}
        </p>

        <div className="sc-notice sc-notice--info" style={{ alignItems: 'center' }}>
          <FaShieldAlt size={14} style={{ flexShrink: 0, opacity: 0.85 }} />
          <span>{t('recovery.noPassword')}</span>
        </div>

        {!isFirstDownload && (
          <div className="sc-notice sc-notice--danger">
            {t('recovery.replaceOld')}
          </div>
        )}

        <button onClick={() => void handleDownload()} className="sc-btn sc-btn--gradient sc-btn--lift" style={{ padding: '12px 24px' }}>
          <FaDownload size={15} />
          {hasDownloaded ? t('recovery.downloadAgain') : t('recovery.download')}
        </button>

        <button onClick={handleClose} disabled={!hasDownloaded} className="sc-btn sc-btn--secondary" style={{ padding: '10px 24px', fontWeight: 500 }}>
          <FaCheckCircle size={15} />
          {t('recovery.done')}
        </button>
      </div>
    </Modal>
  );
}
