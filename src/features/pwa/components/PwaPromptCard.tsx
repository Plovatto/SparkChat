import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FaTimes } from 'react-icons/fa';
import { useTheme } from '@features/theme';

interface PwaPromptCardProps {
  icon: ReactNode;
  title: string;
  text: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
  busy?: boolean;
}

export function PwaPromptCard({ icon, title, text, primaryLabel, onPrimary, secondaryLabel, onSecondary, busy = false }: PwaPromptCardProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <section
      className="sc-card sc-anim-rise-in pwa-prompt-card"
      aria-label={title}
      style={{
        position: 'relative',
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
        borderRadius: '14px',
        padding: '14px 14px 14px 14px',
        marginBottom: '10px',
        background: theme.surfaceElevated,
        border: `1px solid ${theme.borderSubtle}`,
        boxShadow: theme.shadowSm,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: '38px',
          height: '38px',
          borderRadius: '12px',
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: theme.accentSoft,
          color: theme.accentText,
        }}
      >
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0, paddingRight: '22px' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: '0.92rem', fontWeight: 700, color: theme.textPrimary, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{title}</h2>
        <p style={{ margin: 0, fontSize: '0.8rem', lineHeight: 1.45, color: theme.textSecondary, overflowWrap: 'anywhere' }}>{text}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
          <button type="button" onClick={onPrimary} disabled={busy} className="sc-btn sc-btn--primary sc-btn--lift" style={{ padding: '8px 16px', borderRadius: '10px', fontSize: '0.82rem' }}>
            {primaryLabel}
          </button>
          <button type="button" onClick={onSecondary} className="sc-btn sc-btn--text" style={{ padding: '8px 12px', borderRadius: '10px', fontSize: '0.82rem' }}>
            {secondaryLabel}
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={onSecondary}
        title={t('pwa.card.dismiss')}
        aria-label={t('pwa.card.dismiss')}
        className="sc-icon-btn sc-icon-btn--ghost"
        style={{ position: 'absolute', top: '8px', right: '8px', width: '28px', height: '28px', color: theme.textMuted }}
      >
        <FaTimes size={12} />
      </button>
    </section>
  );
}
