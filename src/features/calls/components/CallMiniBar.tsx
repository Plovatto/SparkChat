import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaExpandAlt, FaMicrophone, FaMicrophoneSlash, FaPhoneSlash } from 'react-icons/fa';
import { useTheme } from '@features/theme';
import { formatCallDuration } from '@lib/format';
import { useCall } from '../call-context';

interface CallMiniBarProps {
  attached?: boolean;
}

export function CallStatusBar() {
  return <CallMiniBar attached />;
}

export function CallMiniBar({ attached = false }: CallMiniBarProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const call = useCall();
  const { snapshot, minimized } = call;
  const { state } = snapshot;
  const { registerStatusBar, hasStatusBar } = call;
  const [now, setNow] = useState(() => Date.now());
  const live = state.phase !== 'idle' && state.phase !== 'incoming-ringing' && state.phase !== 'ended';

  useEffect(() => {
    if (!attached) {
      return;
    }
    return registerStatusBar();
  }, [attached, registerStatusBar]);

  useEffect(() => {
    if (!minimized || !live) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [minimized, live]);

  if (!minimized || !live || (!attached && hasStatusBar)) {
    return null;
  }
  const peer = call.peerDisplay(state.peerId);
  const label = state.phase === 'active' && state.connectedAt !== null ? formatCallDuration((now - state.connectedAt) / 1000) : t(state.phase === 'reconnecting' ? 'calls.status.reconnecting' : state.phase === 'connecting' ? 'calls.status.connecting' : 'calls.status.calling');
  const barColor = attached ? '#ffffff' : theme.onGradient;
  const icon = { background: 'transparent', border: 'none', color: barColor, cursor: 'pointer', padding: '6px' } as const;

  return (
    <div
      role="status"
      style={{
        ...(attached ? { position: 'relative', flexShrink: 0 } : { position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1060 }),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        padding: '6px 12px',
        background: attached ? theme.success : theme.gradient,
        color: attached ? '#ffffff' : theme.onGradient,
        borderBottom: attached ? `1px solid ${theme.border}` : undefined,
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
        <button type="button" style={{ ...icon, color: attached ? '#ffffff' : theme.dangerText, background: attached ? theme.danger : 'transparent', borderRadius: attached ? '50%' : undefined }} onClick={call.hangup} aria-label={t('calls.hangup')}>
          <FaPhoneSlash size={16} />
        </button>
      </div>
    </div>
  );
}
