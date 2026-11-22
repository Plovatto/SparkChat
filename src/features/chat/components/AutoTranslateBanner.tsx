import { useId } from 'react';
import { MdTranslate } from 'react-icons/md';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@features/theme';
import type { Language } from '@lib/i18n/language';

interface AutoTranslateBannerProps {
  language: Language;
  onAccept: () => void;
  onDismiss: () => void;
  isExiting?: boolean;
}

export function AutoTranslateBanner({ language, onAccept, onDismiss, isExiting = false }: AutoTranslateBannerProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const titleId = useId();

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      className={isExiting ? 'sc-anim-rise-out' : 'sc-anim-rise-in'}
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '8px 12px',
        padding: '10px 16px',
        background: theme.surface,
        borderBottom: `1px solid ${theme.border}`,
        color: theme.textPrimary,
        fontSize: '0.88rem',
      }}
    >
      <MdTranslate size={18} color={theme.accentText} aria-hidden="true" style={{ flex: '0 0 auto' }} />
      <span id={titleId} style={{ flex: '1 1 220px', minWidth: 0 }}>
        {t('chat.translation.suggestTitle', { language: t(`chat.translation.languages.${language}`) })}
      </span>
      <div style={{ display: 'flex', gap: '8px', flex: '0 0 auto' }}>
        <button type="button" onClick={onDismiss} className="sc-btn sc-btn--secondary" style={{ padding: '6px 14px', fontSize: '0.82rem', fontWeight: 500 }}>
          {t('chat.translation.suggestDismiss')}
        </button>
        <button type="button" onClick={onAccept} aria-describedby={titleId} className="sc-btn sc-btn--primary" style={{ padding: '6px 14px', fontSize: '0.82rem' }}>
          {t('chat.translation.suggestAccept')}
        </button>
      </div>
    </div>
  );
}
