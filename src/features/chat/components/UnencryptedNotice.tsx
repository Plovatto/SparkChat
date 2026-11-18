import { FaLockOpen } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@features/theme';

export function UnencryptedNotice() {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <div style={{ padding: '6px 12px 0' }}>
      <span
        role="note"
        title={t('chat.message.notEncryptedHint')}
        aria-label={`${t('chat.message.notEncrypted')}. ${t('chat.message.notEncryptedHint')}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          borderRadius: '999px',
          fontSize: '0.7rem',
          fontWeight: 600,
          lineHeight: 1.4,
          background: theme.warningSoft,
          color: theme.warningText,
          border: `1px solid ${theme.warning}`,
        }}
      >
        <FaLockOpen size={10} aria-hidden="true" />
        {t('chat.message.notEncrypted')}
      </span>
    </div>
  );
}
