import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { LuMic, LuMicOff, LuPhone, LuPhoneOff, LuVideo } from 'react-icons/lu';
import { formatCallDuration } from '@lib/format';
import { speakingClass } from '../lib/self-speaking';
import { Collapse } from '@features/motion';
import { useCall, useLocalSpeaking } from '../call-context';
import { isMounted } from '../lib/presence';
import { usePresence } from './use-presence';
import { FRAME_GAP_PX, FRAME_SELECTOR, frameInsets, type FrameInsets } from '../lib/frame-anchor';

function useFrameInsets(enabled: boolean): FrameInsets | null {
  const [insets, setInsets] = useState<FrameInsets | null>(null);
  useLayoutEffect(() => {
    if (!enabled) {
      setInsets(null);
      return;
    }
    let frame = document.querySelector<HTMLElement>(FRAME_SELECTOR);
    if (!frame) {
      setInsets(null);
      return;
    }
    const measure = () => {
      if (!frame?.isConnected) {
        frame = document.querySelector<HTMLElement>(FRAME_SELECTOR);
      }
      const root = document.documentElement;
      const next = frame ? frameInsets(frame.getBoundingClientRect(), { width: root.clientWidth || window.innerWidth, height: root.clientHeight || window.innerHeight }, FRAME_GAP_PX) : null;
      setInsets((current) => (current?.right === next?.right && current?.bottom === next?.bottom ? current : next));
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(frame);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [enabled]);
  return insets;
}

interface CallMiniBarProps {
  attached?: boolean;
}

export function CallStatusBar() {
  return <CallMiniBar attached />;
}

export function CallMiniBar({ attached = false }: CallMiniBarProps) {
  const { t } = useTranslation();
  const call = useCall();
  const localSpeaking = useLocalSpeaking();
  const { snapshot, minimized } = call;
  const { state } = snapshot;
  const { registerStatusBar, hasStatusBar } = call;
  const [now, setNow] = useState(() => Date.now());
  const live = state.phase !== 'idle' && state.phase !== 'incoming-ringing' && state.phase !== 'ended';
  const visible = minimized && live && (attached || !hasStatusBar);
  const stage = usePresence(visible, 340, 180);
  const floating = !attached && isMounted(stage);
  const insets = useFrameInsets(floating);

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

  const peer = call.peerDisplay(state.peerId);
  const connected = state.phase === 'active' && state.connectedAt !== null;
  const label = connected
    ? formatCallDuration((now - (state.connectedAt ?? now)) / 1000)
    : t(state.phase === 'reconnecting' ? 'calls.status.reconnecting' : state.phase === 'connecting' ? 'calls.status.connecting' : 'calls.status.calling');
  const shownRef = useRef({ name: peer?.name ?? '', label, connected, video: state.kind === 'video' });
  if (visible) {
    shownRef.current = { name: peer?.name ?? '', label, connected, video: state.kind === 'video' };
  }
  if (!isMounted(stage)) {
    return null;
  }
  const shown = shownRef.current;
  const exiting = stage === 'exiting';
  const KindIcon = shown.video ? LuVideo : LuPhone;
  const muteLabel = snapshot.muted ? t('calls.unmute') : t('calls.mute');

  const bar = (
    <div
      role="status"
      className={`sc-livebar ${attached ? 'sc-livebar--attached' : 'sc-livebar--floating'}`}
      data-connected={shown.connected}
      data-state={exiting ? 'exiting' : undefined}
      style={insets ? ({ '--sc-livebar-right': `${insets.right}px`, '--sc-livebar-bottom': `${insets.bottom}px` } as CSSProperties) : undefined}
      onClick={(event) => {
        if (!(event.target instanceof Element) || event.target.closest('[data-bar-action]') === null) {
          call.setMinimized(false);
        }
      }}
    >
      <span className="sc-livebar__tint" aria-hidden="true" />
      <button type="button" className="sc-livebar__main" aria-label={t('calls.expand')} title={t('calls.expand')}>
        <span className="sc-livebar__badge" aria-hidden="true">
          <KindIcon size={18} />
          <span className="sc-livebar__dot" />
        </span>
        <span className="sc-livebar__text">
          <span className="sc-livebar__name">{shown.name}</span>
          <span className="sc-livebar__meta">{shown.label}</span>
        </span>
      </button>
      <div className="sc-livebar__actions">
        <button
          type="button"
          data-bar-action=""
          className={speakingClass('sc-livebar__btn sc-livebar__btn--mute', localSpeaking)}
          data-muted={snapshot.muted}
          onClick={call.toggleMute}
          aria-label={muteLabel}
          title={localSpeaking ? `${muteLabel} · ${t('calls.micPickingUp')}` : muteLabel}
          aria-pressed={snapshot.muted}
        >
          {snapshot.muted ? <LuMicOff size={18} aria-hidden="true" /> : <LuMic size={18} aria-hidden="true" />}
        </button>
        <button type="button" data-bar-action="" className="sc-livebar__btn sc-livebar__btn--hangup" onClick={call.hangup} aria-label={t('calls.hangup')} title={t('calls.hangup')}>
          <LuPhoneOff size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );

  if (!attached) {
    return bar;
  }
  return (
    <Collapse isExiting={exiting} className="sc-livebar-slot">
      {bar}
    </Collapse>
  );
}
