import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { FaBell, FaBellSlash } from 'react-icons/fa';
import { Spinner } from '@components/common/Spinner';
import { Switch } from '@components/common/Switch';
import { useTheme } from '@features/theme';
import { translateErrorPayload } from '@lib/api/api-error';
import { usePushNotifications, type PushStatus } from '../hooks/usePushNotifications';
import { openInstallSheet } from '../lib/install-state';
import '../styles/pwa.css';

const HINT_KEYS = {
  blocked: 'pwa.push.blocked',
  unsupported: 'pwa.push.unsupported',
  'ios-needs-install': 'pwa.push.iosNeedsInstall',
  'server-disabled': 'pwa.push.serverDisabled',
} as const satisfies Partial<Record<PushStatus, string>>;

export function PushNotificationsRow() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const labelId = useId();
  const descriptionId = useId();
  const { status, busy, error, serverError, enable, disable } = usePushNotifications();
  const isOn = status === 'on';
  const isToggleable = status === 'on' || status === 'off';
  const hintKey = status in HINT_KEYS ? HINT_KEYS[status as keyof typeof HINT_KEYS] : null;

  const handleToggle = () => {
    if (busy) {
      return;
    }
    if (isOn) {
      void disable();
    } else {
      void enable();
    }
  };

  return (
    <div className="sc-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderRadius: '10px', padding: '16px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '26px' }}>
        <span aria-hidden="true" style={{ width: '20px', display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>
          <span key={isOn ? 'on' : 'off'} className="pwa-push-icon">
            {isOn ? <FaBell size={16} color={theme.accentText} /> : <FaBellSlash size={16} color={theme.textMuted} />}
          </span>
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span id={labelId} style={{ display: 'block', fontWeight: 600, color: theme.textPrimary, fontSize: '0.92rem', lineHeight: 1.35, overflowWrap: 'anywhere' }}>
            {t('pwa.push.label')}
          </span>
          <span id={descriptionId} style={{ display: 'block', marginTop: '2px', color: theme.textSecondary, fontSize: '0.78rem', lineHeight: 1.4, overflowWrap: 'anywhere' }}>
            {t('pwa.push.description')}
          </span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {(busy || status === 'checking') && <Spinner size={14} />}
          {isToggleable && <Switch checked={isOn} onChange={handleToggle} aria-labelledby={labelId} aria-describedby={descriptionId} />}
        </span>
      </div>
      {hintKey && (
        <p key={status} className="pwa-push-hint" data-tone={status === 'blocked' ? 'danger' : 'info'} role="note">
          <span>{t(hintKey)}</span>
          {status === 'ios-needs-install' && (
            <button type="button" onClick={openInstallSheet} className="pwa-push-hint__action">
              {t('pwa.card.iosInstallAction')}
            </button>
          )}
        </p>
      )}
      {error && (
        <div className="sc-notice sc-notice--danger pwa-push-notice" role="alert">
          {translateErrorPayload({ code: serverError?.code, params: serverError?.params }, 'pwa.push.error')}
        </div>
      )}
    </div>
  );
}
