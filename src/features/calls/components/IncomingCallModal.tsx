import { useTranslation } from 'react-i18next';
import { FaPhone, FaPhoneSlash, FaVideo, FaVolumeMute } from 'react-icons/fa';
import { AVATARS, AVATAR_ICON_COLOR } from '@features/auth/constants/avatars';
import { useContactTrust } from '@features/chat/hooks/useContactTrust';
import { useTheme } from '@features/theme';
import { translate } from '@lib/i18n/app-i18n';
import { useCall } from '../call-context';

export function IncomingCallModal() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const call = useCall();
  const { state } = call.snapshot;
  const trust = useContactTrust(state.phase === 'incoming-ringing' ? (state.peerId ?? undefined) : undefined);
  if (state.phase !== 'incoming-ringing' || !state.kind) {
    return null;
  }
  const peer = call.peerDisplay(state.peerId);
  const avatar = peer ? AVATARS[peer.avatar] : undefined;
  const round = { width: '56px', height: '56px', borderRadius: '50%', border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' } as const;
  const answer = () => {
    call.primePlayback();
    call.accept();
  };

  return (
    <div
      role="alertdialog"
      aria-label={translate(`calls.incoming.${state.kind}`)}
      style={{
        position: 'fixed',
        top: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1070,
        width: 'min(360px, calc(100vw - 32px))',
        background: theme.surfaceElevated,
        color: theme.textPrimary,
        borderRadius: '16px',
        boxShadow: theme.shadowMd,
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: avatar?.bgGradient ?? theme.gradientControl, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {avatar ? <avatar.icon size={32} color={AVATAR_ICON_COLOR} /> : null}
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{peer?.name ?? ''}</div>
        <small style={{ color: theme.textSecondary }}>{translate(`calls.incoming.${state.kind}`)}</small>
        {trust && (
          <div>
            <small style={{ color: trust.status === 'verified' ? theme.successText : theme.warningText }}>
              {trust.status === 'verified' ? t('calls.verified') : t('calls.notVerified')}
            </small>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '20px' }}>
        <button type="button" style={{ ...round, background: theme.danger, color: theme.textOnAccent }} onClick={call.decline} title={t('calls.decline')} aria-label={t('calls.decline')}>
          <FaPhoneSlash size={20} />
        </button>
        <button type="button" style={{ ...round, background: theme.surfaceSunken, color: theme.textPrimary }} onClick={call.silence} title={t('calls.silence')} aria-label={t('calls.silence')}>
          <FaVolumeMute size={20} />
        </button>
        <button type="button" style={{ ...round, background: theme.success, color: theme.textOnAccent }} onClick={answer} title={t('calls.answer')} aria-label={t('calls.answer')}>
          {state.kind === 'video' ? <FaVideo size={20} /> : <FaPhone size={20} />}
        </button>
      </div>
    </div>
  );
}
