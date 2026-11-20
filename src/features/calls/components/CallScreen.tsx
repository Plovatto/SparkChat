import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCompressAlt } from 'react-icons/fa';
import { Avatar } from '@features/profile-photos/components/Avatar';
import { useTheme } from '@features/theme';
import { formatCallDuration } from '@lib/format';
import { hasTranslation, translate } from '@lib/i18n/app-i18n';
import { useCall } from '../call-context';
import { CallControls } from './CallControls';
import { CallQualityBars } from './CallQualityBars';

interface CallScreenProps {
  videoRef: RefObject<HTMLVideoElement | null>;
}

function useElapsed(connectedAt: number | null, running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running || connectedAt === null) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running, connectedAt]);
  return connectedAt === null ? 0 : Math.max(0, Math.floor((now - connectedAt) / 1000));
}

export function CallScreen({ videoRef }: CallScreenProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const call = useCall();
  const { snapshot, minimized } = call;
  const { state } = snapshot;
  const localRef = useRef<HTMLVideoElement>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const peer = call.peerDisplay(state.peerId);
  const running = state.phase === 'active' || state.phase === 'reconnecting';
  const elapsed = useElapsed(state.connectedAt, running);
  const isVideo = state.kind === 'video' || snapshot.cameraOn || snapshot.remoteCameraOn;
  const showRemoteVideo = snapshot.remoteStream !== null && snapshot.remoteCameraOn;
  const supportsOutput = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

  useEffect(() => {
    const element = videoRef.current;
    if (!element) {
      return;
    }
    element.srcObject = snapshot.remoteStream;
    if (snapshot.remoteStream) {
      void element.play().then(
        () => setNeedsTap(false),
        () => setNeedsTap(true),
      );
    }
  }, [snapshot.remoteStream, videoRef]);

  useEffect(() => {
    if (localRef.current) {
      localRef.current.srcObject = snapshot.cameraOn ? snapshot.localStream : null;
    }
  }, [snapshot.localStream, snapshot.cameraOn]);

  const chooseOutput = (deviceId: string) => {
    void (videoRef.current)?.setSinkId?.(deviceId).catch(() => undefined);
  };

  const statusText = (() => {
    switch (state.phase) {
      case 'outgoing-ringing':
        return t('calls.status.calling');
      case 'incoming-ringing':
        return t('calls.status.ringing');
      case 'connecting':
        return t('calls.status.connecting');
      case 'reconnecting':
        return t('calls.status.reconnecting');
      case 'active':
        return formatCallDuration(elapsed);
      case 'ended':
        return translate(`calls.ended.${state.reason ?? 'completed'}`);
      default:
        return '';
    }
  })();

  const warning = (() => {
    if (state.phase === 'ended' && state.detail && hasTranslation(`calls.detail.${state.detail}`)) {
      return translate(`calls.detail.${state.detail}`);
    }
    if (snapshot.cameraFailed) {
      return t('calls.cameraFailed');
    }
    if (snapshot.degrade === 'audio-only-relay') {
      return t('calls.relayDegraded');
    }
    if (snapshot.degrade === 'video-360') {
      return t('calls.videoDegraded');
    }
    return null;
  })();

  const hidden = minimized || state.phase === 'idle' || state.phase === 'incoming-ringing';

  return (
    <div
      role="dialog"
      aria-label={isVideo ? t('calls.start.video') : t('calls.start.voice')}
      style={{
        display: hidden ? 'none' : 'flex',
        position: 'fixed',
        inset: 0,
        zIndex: 1060,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '24px 16px',
        background: theme.gradient,
        color: theme.onGradient,
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: showRemoteVideo ? 'block' : 'none' }}
      />
      <div style={{ position: 'relative', display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
        <button type="button" className="sc-icon-btn sc-icon-btn--header" onClick={() => call.setMinimized(true)} title={t('calls.minimize')} aria-label={t('calls.minimize')} style={{ width: '52px', height: '52px' }}>
          <FaCompressAlt size={24} />
        </button>
        <CallQualityBars bars={snapshot.quality} />
      </div>

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', textAlign: 'center' }}>
        {!showRemoteVideo && (
          <Avatar userId={peer ? state.peerId : null} avatarIndex={peer?.avatar} size={112} iconSize={56} />
        )}
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>{peer?.name ?? ''}</h2>
        <div aria-live="polite" style={{ fontSize: '1rem', color: theme.onGradientMuted }}>
          {statusText}
        </div>
        {snapshot.remoteMuted && <small style={{ color: theme.onGradientMuted }}>{t('calls.remoteMuted')}</small>}
        {state.kind === 'video' && snapshot.remoteStream !== null && !snapshot.remoteCameraOn && <small style={{ color: theme.onGradientMuted }}>{t('calls.remoteCameraOff')}</small>}
        {warning && (
          <div role="status" style={{ maxWidth: '320px', fontSize: '0.85rem', background: theme.warningSoft, color: theme.warningText, borderRadius: '10px', padding: '8px 12px' }}>
            {warning}
          </div>
        )}
        {needsTap && (
          <button type="button" className="sc-btn sc-btn--primary" onClick={() => void videoRef.current?.play().then(() => setNeedsTap(false))}>
            {t('calls.tapToResume')}
          </button>
        )}
      </div>

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', width: '100%' }}>
        {snapshot.cameraOn && (
          <video
            ref={localRef}
            autoPlay
            playsInline
            muted
            style={{ position: 'absolute', right: 0, bottom: '100%', width: '110px', height: '150px', objectFit: 'cover', borderRadius: '12px', transform: 'scaleX(-1)', background: theme.surfaceSunken }}
          />
        )}
        {state.phase === 'ended' ? (
          <button type="button" className="sc-btn sc-btn--primary" onClick={call.dismissEnded}>
            {t('calls.close')}
          </button>
        ) : (
          <CallControls supportsOutput={supportsOutput} onAudioOutput={chooseOutput} />
        )}
      </div>

    </div>
  );
}
