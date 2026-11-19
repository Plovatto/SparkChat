import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaExpandAlt, FaMicrophone, FaMicrophoneSlash, FaPhoneSlash } from 'react-icons/fa';
import { useTheme } from '@features/theme';
import { formatCallDuration } from '@lib/format';
import { useCall } from '../call-context';

export function CallMiniBar() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const call = useCall();
  const { snapshot, minimized } = call;
  const { state } = snapshot;
  const [now, setNow] = useState(() => Date.now());
  const live = state.phase !== 'idle' && state.phase !== 'incoming-ringing' && state.phase !== 'ended';

  useEffect(() => {
    if (!minimized || !live) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [minimized, live]);

  if (!minimized || !live) {
    return null;
  }
  const peer = call.peerDisplay(state.peerId);
  const label = state.phase === 'active' && state.connectedAt !== null ? formatCallDuration((now - state.connectedAt) / 1000) : t(state.phase === 'reconnecting' ? 'calls.status.reconnecting' : state.phase === 'connecting' ? 'calls.status.connecting' : 'calls.status.calling');
  const icon = { background: 'transparent', border: 'none', color: theme.onGradient, cursor: 'pointer', padding: '6px' } as const;

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1060,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        padding: '6px 12px',
        background: theme.gradient,
        color: theme.onGradient,
      }}
    >
      <button type="button" style={{ ...icon, display: 'flex', gap: '8px', alignItems: 'center', fontWeight: 600 }} onClick={() => call.setMinimized(false)} aria-label={t('calls.expand')}>
        <FaExpandAlt size={14} />
        <span>{peer?.name ?? ''}</span>
        <span style={{ opacity: 0.85 }}>{label}</span>
      </button>
      <div style={{ display: 'flex', gap: '4px' }}>
        <button type="button" style={icon} onClick={call.toggleMute} aria-label={snapshot.muted ? t('calls.unmute') : t('calls.mute')} aria-pressed={snapshot.muted}>
          {snapshot.muted ? <FaMicrophoneSlash size={16} /> : <FaMicrophone size={16} />}
        </button>
        <button type="button" style={{ ...icon, color: theme.dangerText }} onClick={call.hangup} aria-label={t('calls.hangup')}>
          <FaPhoneSlash size={16} />
        </button>
      </div>
    </div>
  );
}
