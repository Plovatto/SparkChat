import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaMicrophone, FaMicrophoneSlash } from 'react-icons/fa';
import { MdCallEnd } from 'react-icons/md';
import { useTheme } from '@features/theme';
import { formatCallDuration } from '@lib/format';
import { speakingClass } from '../lib/self-speaking';
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
  const label =
    state.phase === 'active' && state.connectedAt !== null
      ? formatCallDuration((now - state.connectedAt) / 1000)
      : t(state.phase === 'reconnecting' ? 'calls.status.reconnecting' : state.phase === 'connecting' ? 'calls.status.connecting' : 'calls.status.calling');
  const barColor = attached ? '#ffffff' : theme.onGradient;
  const barBackground = attached ? `color-mix(in srgb, ${theme.success} 80%, #000000)` : theme.gradient;
  const round = {
    width: attached ? '42px' : '40px',
    height: attached ? '42px' : '40px',
    flexShrink: 0,
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as const;

  return (
    <div
      role="status"
      className="sc-call-bar"
      onClick={(event) => {
        if (!(event.target instanceof Element) || event.target.closest('[data-bar-action]') === null) {
          call.setMinimized(false);
        }
      }}
      style={{
        cursor: 'pointer',
        ...(attached ? { position: 'relative', zIndex: 3, flexShrink: 0 } : { position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1060 }),
        display: 'flex',
        alignItems: 'center',
        gap: attached ? '10px' : '8px',
        minHeight: attached ? '60px' : '52px',
        padding: attached ? '0 16px' : '6px 12px',
        lineHeight: 1,
        boxSizing: 'border-box',
        width: '100%',
        background: barBackground,
        color: barColor,
        borderBottom: attached ? `1px solid ${theme.border}` : undefined,
      }}
    >
      <button
        type="button"
        aria-label={t('calls.expand')}
        title={t('calls.expand')}
        style={{ flex: 1, minWidth: 0, alignSelf: 'stretch', display: 'flex', alignItems: 'center', gap: '10px', background: 'transparent', border: 'none', color: barColor, cursor: 'pointer', padding: attached ? '0' : '6px 4px', textAlign: 'left', fontWeight: 600, lineHeight: 1 }}
      >
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>{peer?.name ?? ''}</span>
        <span style={{ flexShrink: 0, whiteSpace: 'nowrap', opacity: 0.9, fontVariantNumeric: 'tabular-nums', fontSize: '0.9rem' }}>{label}</span>
      </button>
      <button
        type="button"
        data-bar-action=""
        className={speakingClass('sc-call-bar__mute', call.localSpeaking)}
        onClick={call.toggleMute}
        aria-label={snapshot.muted ? t('calls.unmute') : t('calls.mute')}
        title={call.localSpeaking ? `${snapshot.muted ? t('calls.unmute') : t('calls.mute')} · ${t('calls.micPickingUp')}` : snapshot.muted ? t('calls.unmute') : t('calls.mute')}
        aria-pressed={snapshot.muted}
        style={{ ...round, background: 'rgba(255, 255, 255, 0.18)', color: barColor }}
      >
        {snapshot.muted ? <FaMicrophoneSlash size={17} /> : <FaMicrophone size={17} />}
      </button>
      <button type="button" data-bar-action="" onClick={call.hangup} aria-label={t('calls.hangup')} title={t('calls.hangup')} style={{ ...round, background: theme.danger, color: '#ffffff' }}>
        <MdCallEnd size={24} />
      </button>
    </div>
  );
}
