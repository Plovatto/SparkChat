import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { FaExclamationTriangle } from 'react-icons/fa';
import { MOTION_DURATION_MS, usePresence } from '@features/motion';
import { useTheme } from '@features/theme';
import { useUpdateAvailable } from '@features/pwa/hooks/useUpdateAvailable';
import '@features/pwa/styles/pwa.css';
import { dismissFailedPendingPhoto, hasFailedPendingPhoto, retryFailedPendingPhoto, subscribeFailedPendingPhoto } from '../lib/photo-actions';

export function PendingPhotoFailedToast() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const failed = useSyncExternalStore(subscribeFailedPendingPhoto, hasFailedPendingPhoto, () => false);
  const { isPresent, isExiting } = usePresence(failed, MOTION_DURATION_MS.fast);
  const updateAvailable = useUpdateAvailable();

  if (!isPresent) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: '16px',
        right: '16px',
        bottom: updateAvailable ? 'calc(88px + env(safe-area-inset-bottom, 0px))' : 'calc(16px + env(safe-area-inset-bottom, 0px))',
        transition: 'bottom var(--sc-dur-normal) var(--sc-ease-standard)',
        zIndex: 10000,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        role="alert"
        className={`pwa-toast-shell${isExiting ? ' is-exiting' : ''}`}
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
          <FaExclamationTriangle size={13} color={theme.dangerText} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span style={{ overflowWrap: 'anywhere' }}>{t('profilePhotos.signupFailed.message')}</span>
        </span>
        <span style={{ display: 'inline-flex', gap: '6px' }}>
          <button type="button" onClick={dismissFailedPendingPhoto} className="sc-btn sc-btn--text" style={{ minHeight: '44px', padding: '7px 14px', borderRadius: '10px', fontSize: '0.82rem' }}>
            {t('profilePhotos.signupFailed.dismiss')}
          </button>
          <button type="button" onClick={retryFailedPendingPhoto} className="sc-btn sc-btn--primary" style={{ minHeight: '44px', padding: '7px 16px', borderRadius: '10px', fontSize: '0.82rem' }}>
            {t('profilePhotos.signupFailed.retry')}
          </button>
        </span>
      </div>
    </div>
  );
}
