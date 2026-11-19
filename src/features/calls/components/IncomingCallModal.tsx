import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FaPhone, FaVolumeMute } from 'react-icons/fa';
import { MdCallEnd } from 'react-icons/md';
import { AVATARS, AVATAR_ICON_COLOR } from '@features/auth/constants/avatars';
import { useTheme } from '@features/theme';
import { translate } from '@lib/i18n/app-i18n';
import { useCall } from '../call-context';

export function IncomingCallModal() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const call = useCall();
  const { state } = call.snapshot;
  const answerRef = useRef<HTMLButtonElement>(null);
  const ringing = state.phase === 'incoming-ringing' && state.kind !== null;
  const { silence } = call;

  useEffect(() => {
    if (!ringing) {
      return;
    }
    answerRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        silence();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [ringing, silence]);

  if (!ringing || !state.kind) {
    return null;
  }
  const peer = call.peerDisplay(state.peerId);
  const avatar = peer ? AVATARS[peer.avatar] : undefined;
  const titleId = 'sc-incoming-title';
  const answer = () => {
    call.primePlayback();
    call.accept();
  };

  return (
    <div
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby="sc-incoming-kind"
      className="sc-incoming"
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target === event.currentTarget) {
          answer();
        }
      }}
    >
      <div className="sc-incoming__head">
        <div className="sc-incoming__avatar" style={{ background: avatar?.bgGradient ?? theme.gradientControl }}>
          {avatar ? <avatar.icon size={44} color={AVATAR_ICON_COLOR} style={{ width: '50%', height: '50%' }} /> : null}
        </div>
        <div className="sc-incoming__text">
          <h2 id={titleId} className="sc-incoming__name">
            {peer?.name ?? ''}
          </h2>
          <span id="sc-incoming-kind" className="sc-incoming__sub">
            {translate(`calls.incomingKind.${state.kind}`)}
          </span>
          <span className="sc-incoming__sub" aria-live="polite">
            {t('calls.status.ringing')}
          </span>
        </div>
      </div>
      <div className="sc-incoming__bottom">
        <div className="sc-incoming__actions">
          <button type="button" className="sc-incoming__action" onClick={call.decline}>
            <span className="sc-incoming__circle" style={{ background: theme.danger }} aria-hidden="true">
              <MdCallEnd size={30} />
            </span>
            {t('calls.decline')}
          </button>
          <button ref={answerRef} type="button" className="sc-incoming__action" onClick={answer}>
            <span className="sc-incoming__circle" style={{ background: theme.success }} aria-hidden="true">
              <FaPhone size={22} />
            </span>
            {t('calls.answer')}
          </button>
        </div>
        <div className="sc-incoming__footer">
          <button type="button" className="sc-incoming__silence" onClick={call.silence}>
            <FaVolumeMute size={14} aria-hidden="true" />
            {t('calls.silence')}
          </button>
        </div>
      </div>
    </div>
  );
}
