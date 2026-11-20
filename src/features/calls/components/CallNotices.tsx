import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@features/theme';
import { translate } from '@lib/i18n/app-i18n';
import { translateErrorPayload } from '@lib/api/api-error';
import { useCall } from '../call-context';

const NOTICE_TIMEOUT_MS = 7000;

export function CallNotices() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const call = useCall();
  const { notice, otherTab, state } = call.snapshot;
  const { dismissNotice } = call;

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = setTimeout(dismissNotice, NOTICE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [notice, dismissNotice]);

  const bar = {
    position: 'fixed',
    bottom: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1070,
    maxWidth: 'min(420px, calc(100vw - 32px))',
    borderRadius: '12px',
    padding: '10px 14px',
    boxShadow: theme.shadowMd,
    fontSize: '0.9rem',
  } as const;

  if (notice) {
    const text =
      notice.kind === 'server-error' && notice.code
        ? translateErrorPayload({ code: notice.code }, 'calls.notice.server-error')
        : translate(`calls.notice.${notice.kind}`);
    return (
      <div role="alert" style={{ ...bar, background: theme.dangerSoft, color: theme.dangerText }}>
        {text}
        <button type="button" onClick={dismissNotice} className="sc-btn sc-btn--text" style={{ marginLeft: '8px' }} aria-label={t('calls.close')}>
          {t('calls.close')}
        </button>
      </div>
    );
  }

  if (call.snapshot.otherDevice && state.phase === 'idle') {
    return (
      <div role="status" style={{ ...bar, background: theme.surfaceElevated, color: theme.textPrimary, display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ minWidth: 0 }}>
          <strong>{t('calls.otherDevice')}</strong>
          <div style={{ color: theme.textSecondary }}>{t('calls.otherDeviceHint')}</div>
        </div>
        <button type="button" className="sc-btn sc-btn--text-danger" onClick={call.endOtherDeviceCall} style={{ flexShrink: 0 }}>
          {t('calls.otherDeviceEnd')}
        </button>
      </div>
    );
  }

  if (otherTab && state.phase === 'idle') {
    return (
      <div role="status" style={{ ...bar, background: theme.surfaceElevated, color: theme.textPrimary }}>
        <strong>{t('calls.otherTab')}</strong>
        <div style={{ color: theme.textSecondary }}>{t('calls.otherTabHint')}</div>
      </div>
    );
  }

  return null;
}
