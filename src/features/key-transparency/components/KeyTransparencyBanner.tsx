import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { FaShieldAlt } from 'react-icons/fa';
import { useTheme } from '@features/theme';
import { PWA_TOAST_EXIT_MS, useRetainedPresence } from '@features/pwa/hooks/useRetainedPresence';
import { getCurrentIdentity } from '@lib/e2ee/current-identity';
import { dismissKtAlert, getActiveKtAlerts, subscribeKtAlerts } from '@lib/kt/kt-alerts';
import { acceptNewLogKey } from '@lib/kt/kt-head';
import { pickAlertToShow } from './alert-priority';
import '../styles/key-transparency.css';

export function KeyTransparencyBanner() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const alerts = useSyncExternalStore(subscribeKtAlerts, getActiveKtAlerts, getActiveKtAlerts);
  const presence = useRetainedPresence(pickAlertToShow(alerts), PWA_TOAST_EXIT_MS);
  const alert = presence.value;

  if (!presence.isPresent || !alert) {
    return null;
  }

  const canTrustNewLog = alert.kind === 'logKeyChanged' && alert.detail === 'stored';
  const handleTrust = () => {
    const identity = getCurrentIdentity();
    if (identity) {
      acceptNewLogKey(identity.userId);
    }
    dismissKtAlert(alert.id);
  };

  return (
    <div className="kt-banner-layer">
      <div
        role="alert"
        className={`kt-banner${presence.isExiting ? ' is-exiting' : ''}`}
        style={{ background: theme.surfaceElevated, color: theme.textPrimary, border: `1px solid ${theme.danger}`, boxShadow: theme.shadowLg }}
      >
        <span className="kt-banner__icon" aria-hidden="true" style={{ background: theme.dangerSoft, color: theme.danger }}>
          <FaShieldAlt size={15} />
        </span>
        <div className="kt-banner__body">
          <h2 className="kt-banner__title">{t(`keyTransparency.alerts.${alert.kind}.title`)}</h2>
          <p className="kt-banner__text" style={{ color: theme.textSecondary }}>
            {t(`keyTransparency.alerts.${alert.kind}.text`)}
          </p>
          <div className="kt-banner__actions">
            {canTrustNewLog ? (
              <button type="button" onClick={handleTrust} className="sc-btn sc-btn--primary" style={{ padding: '7px 14px', borderRadius: '10px', fontSize: '0.82rem' }}>
                {t('keyTransparency.trustNewLog')}
              </button>
            ) : null}
            <button type="button" onClick={() => dismissKtAlert(alert.id)} className="sc-btn sc-btn--text" style={{ padding: '7px 12px', borderRadius: '10px', fontSize: '0.82rem' }}>
              {t('keyTransparency.dismiss')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
