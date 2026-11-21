import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import { LuAppWindow, LuArrowRightLeft, LuCircleAlert, LuMonitorPause, LuShieldAlert, LuSmartphone, LuX } from 'react-icons/lu';
import { translate } from '@lib/i18n/app-i18n';
import { translateErrorPayload } from '@lib/api/api-error';
import { useCall } from '../call-context';
import { isMounted } from '../lib/presence';
import { usePresence } from './use-presence';
import '../styles/call-notices.css';

const NOTICE_TIMEOUT_MS = 7000;

type ToastTone = 'info' | 'danger' | 'warning';

interface Toast {
  id: string;
  tone: ToastTone;
  role: 'status' | 'alert';
  icon: IconType;
  title?: string;
  text: string;
  onClose?: () => void;
  actions?: ReactNode;
}

export function CallNotices() {
  const { t } = useTranslation();
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

  let toast: Toast | null = null;
  if (notice) {
    const text =
      notice.kind === 'server-error' && notice.code
        ? translateErrorPayload({ code: notice.code }, 'calls.notice.server-error')
        : translate(`calls.notice.${notice.kind}`);
    const transferred = notice.kind === 'transferred';
    const keyChanged = notice.kind === 'key-changed';
    toast = {
      id: `notice-${notice.kind}-${notice.code ?? ''}`,
      tone: transferred ? 'info' : keyChanged ? 'warning' : 'danger',
      role: transferred ? 'status' : 'alert',
      icon: transferred ? LuArrowRightLeft : keyChanged ? LuShieldAlert : LuCircleAlert,
      title: keyChanged ? t('calls.keyChangedTitle') : undefined,
      text,
      onClose: dismissNotice,
    };
  } else if (call.minimized && call.snapshot.screenSharing && call.snapshot.screenPaused) {
    toast = { id: 'paused', tone: 'warning', role: 'status', icon: LuMonitorPause, text: t('calls.share.pausedSharer') };
  } else if (call.snapshot.otherDevice && state.phase === 'idle') {
    toast = {
      id: 'other-device',
      tone: 'info',
      role: 'status',
      icon: LuSmartphone,
      title: t('calls.otherDevice'),
      text: t('calls.otherDeviceHint'),
      actions: (
        <>
          <button type="button" className="sc-call-toast__action sc-call-toast__action--primary" onClick={call.transferHere} disabled={call.snapshot.transferring}>
            <LuArrowRightLeft size={16} aria-hidden="true" />
            <span>{t('calls.transferHere')}</span>
          </button>
          <button type="button" className="sc-call-toast__action sc-call-toast__action--danger" onClick={call.endOtherDeviceCall}>
            <span>{t('calls.otherDeviceEnd')}</span>
          </button>
        </>
      ),
    };
  } else if (otherTab && state.phase === 'idle') {
    toast = { id: 'other-tab', tone: 'info', role: 'status', icon: LuAppWindow, title: t('calls.otherTab'), text: t('calls.otherTabHint') };
  }

  const stage = usePresence(toast !== null, 360, 200);
  const lastRef = useRef<Toast | null>(null);
  if (toast) {
    lastRef.current = toast;
  }
  const shown = toast ?? lastRef.current;
  if (!isMounted(stage) || !shown) {
    return null;
  }
  const Icon = shown.icon;
  const belowBar = call.minimized && call.hasStatusBar;

  return (
    <div className="sc-call-toast-region" data-below-bar={belowBar}>
      <div
        key={shown.id}
        role={shown.role}
        className={`sc-call-toast${shown.actions ? ' sc-call-toast--actions' : ''}`}
        data-tone={shown.tone}
        data-state={toast ? stage : 'exiting'}
      >
        <span className="sc-call-toast__icon" aria-hidden="true">
          <Icon size={18} />
        </span>
        <div className="sc-call-toast__body">
          {shown.title && <strong className="sc-call-toast__title">{shown.title}</strong>}
          <span className="sc-call-toast__text">{shown.text}</span>
        </div>
        {shown.onClose && (
          <button type="button" onClick={shown.onClose} className="sc-call-toast__close" aria-label={t('calls.close')} title={t('calls.close')}>
            <LuX size={16} aria-hidden="true" />
          </button>
        )}
        {shown.actions && <div className="sc-call-toast__actions">{shown.actions}</div>}
      </div>
    </div>
  );
}
