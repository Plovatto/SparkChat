import { useEffect, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { FaUserSlash } from 'react-icons/fa';
import { MOTION_DURATION_MS, usePresence } from '@features/motion';
import { useUpdateAvailable } from '@features/pwa/hooks/useUpdateAvailable';
import { useTheme } from '@features/theme';
import '@features/pwa/styles/pwa.css';
import { dismissGroupRemovalNotice, getGroupRemovalNotice, subscribeGroupRemovalNotice } from '../utils/group-removal-notice';

const AUTO_DISMISS_MS = 7000;

export function GroupRemovedToast() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const notice = useSyncExternalStore(subscribeGroupRemovalNotice, getGroupRemovalNotice, () => null);
  const { isPresent, isExiting } = usePresence(notice !== null, MOTION_DURATION_MS.fast);
  const updateAvailable = useUpdateAvailable();

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(dismissGroupRemovalNotice, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!isPresent || !notice) {
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
        role="status"
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
          <FaUserSlash size={14} color={theme.dangerText} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span style={{ overflowWrap: 'anywhere' }}>{t('roomInfo.removedNotice', { name: notice.roomName })}</span>
        </span>
        <button type="button" onClick={dismissGroupRemovalNotice} className="sc-btn sc-btn--text" style={{ minHeight: '44px', padding: '7px 14px', borderRadius: '10px', fontSize: '0.82rem' }}>
          {t('roomInfo.removedDismiss')}
        </button>
      </div>
    </div>
  );
}
