import { useTranslation } from 'react-i18next';
import { FaSyncAlt } from 'react-icons/fa';
import { useTheme } from '@features/theme';
import { PWA_TOAST_EXIT_MS, useRetainedPresence } from '../hooks/useRetainedPresence';
import { useUpdateAvailable } from '../hooks/useUpdateAvailable';
import '../styles/pwa.css';
import { dismissUpdate } from '../lib/sw-registration';

export function UpdateToast() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const updateAvailable = useUpdateAvailable();
  const presence = useRetainedPresence(updateAvailable ? true : null, PWA_TOAST_EXIT_MS);

  if (!presence.isPresent) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: '16px',
        right: '16px',
        bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        zIndex: 10000,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        role="status"
        aria-live="polite"
        className={`pwa-toast-shell pwa-update-toast${presence.isExiting ? ' is-exiting' : ''}`}
        style={{
          pointerEvents: 'auto',
          maxWidth: '100%',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px 12px',
          padding: '10px 12px 10px 16px',
          borderRadius: '14px',
          background: theme.surfaceElevated,
          color: theme.textPrimary,
          border: `1px solid ${theme.border}`,
          boxShadow: theme.shadowLg,
          fontSize: '0.88rem',
          fontWeight: 600,
          boxSizing: 'border-box',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <FaSyncAlt size={13} color={theme.accentText} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span style={{ overflowWrap: 'anywhere' }}>{t('pwa.update.message')}</span>
        </span>
        <span style={{ display: 'inline-flex', gap: '6px' }}>
          <button type="button" onClick={dismissUpdate} className="sc-btn sc-btn--text" style={{ padding: '7px 12px', borderRadius: '10px', fontSize: '0.82rem' }}>
            {t('pwa.update.dismiss')}
          </button>
          <button type="button" onClick={() => window.location.reload()} className="sc-btn sc-btn--primary" style={{ padding: '7px 14px', borderRadius: '10px', fontSize: '0.82rem' }}>
            {t('pwa.update.reload')}
          </button>
        </span>
      </div>
    </div>
  );
}
