import { useTranslation } from 'react-i18next';
import { FaComments, FaTimes, FaUsers } from 'react-icons/fa';
import { Modal } from '@components/common/Modal';
import { useTheme } from '@features/theme';
import type { DeepLinkIntent } from './deep-link';

interface DeepLinkConfirmDialogProps {
  intent: DeepLinkIntent | null;
  canConfirm: boolean;
  onConfirm: (intent: DeepLinkIntent) => void;
  onCancel: () => void;
}

export function DeepLinkConfirmDialog({ intent, canConfirm, onConfirm, onCancel }: DeepLinkConfirmDialogProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isJoin = intent?.kind === 'invite';
  const title = isJoin ? t('app.deepLink.joinTitle') : t('app.deepLink.chatTitle');
  const message =
    intent?.kind === 'invite'
      ? t('app.deepLink.joinMessage')
      : intent?.kind === 'chat'
        ? t('app.deepLink.chatMessage', { nickname: intent.nickname })
        : '';
  const Icon = isJoin ? FaUsers : FaComments;

  const handleConfirm = () => {
    if (intent) {
      onConfirm(intent);
    }
  };

  return (
    <Modal isOpen={intent !== null} title={title} onClose={onCancel}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <p style={{ margin: 0, fontSize: '1rem', lineHeight: 1.6, color: theme.textPrimary, overflowWrap: 'anywhere' }}>{message}</p>

        <div className="sc-notice sc-notice--info" style={{ alignItems: 'center' }}>
          <Icon size={13} style={{ flexShrink: 0, opacity: 0.85 }} />
          <span>{t('app.deepLink.notice')}</span>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} className="sc-btn sc-btn--secondary sc-btn--lift" style={{ padding: '10px 24px', fontWeight: 500 }}>
            <FaTimes size={14} />
            {t('common.cancel')}
          </button>

          <button onClick={handleConfirm} disabled={!canConfirm} className="sc-btn sc-btn--primary sc-btn--lift" style={{ padding: '10px 24px' }}>
            <Icon size={14} />
            {isJoin ? t('app.deepLink.confirmJoin') : t('app.deepLink.confirmChat')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
