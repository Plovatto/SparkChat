import type { CSSProperties } from 'react';
import { FaComments } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@features/theme';

export function EmptyChatState() {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: theme.canvas,
        color: theme.textSecondary,
        padding: '40px',
        textAlign: 'center',
      }}
    >
      <span className="sc-empty-icon" style={{ marginBottom: '30px' }}>
        <FaComments size={100} className="animate-float" style={{ color: theme.accentText, opacity: 0.35 }} />
      </span>
      <h2
        className="sc-anim-rise-in sc-stagger"
        style={{ fontSize: '2rem', marginBottom: '15px', color: theme.textPrimary, fontWeight: 700, '--sc-stagger-index': 1 } as CSSProperties}
      >
        {t('chat.empty.title')}
      </h2>
      <p
        className="sc-anim-rise-in sc-stagger"
        style={{ fontSize: '1.1rem', color: theme.textSecondary, maxWidth: '400px', '--sc-stagger-index': 2 } as CSSProperties}
      >
        {t('chat.empty.text')}
      </p>
    </div>
  );
}
