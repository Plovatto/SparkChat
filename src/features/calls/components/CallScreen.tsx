import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCompressAlt, FaMicrophoneSlash, FaVolumeMute, FaVolumeUp, FaWifi } from 'react-icons/fa';
import { MdScreenShare } from 'react-icons/md';
import { AVATARS } from '@features/auth/constants/avatars';
import { Avatar } from '@features/profile-photos/components/Avatar';
import { useUserPhoto } from '@features/profile-photos';
import { useTheme } from '@features/theme';
import { formatCallDuration } from '@lib/format';
import { hasTranslation, translate } from '@lib/i18n/app-i18n';
import { useCall } from '../call-context';
import { autoplay } from '../lib/autoplay';
import { pipMode } from '../lib/picture-in-picture';
import { isMounted } from '../lib/presence';
import { selectStageLayout } from '../lib/stage-layout';
import { describeShareSurface } from '../lib/share-surface';
import { CallControls } from './CallControls';
import type { BroadcastSettings } from './DevicePicker';
import { CallPip } from './CallPip';
import { CallQualityBars } from './CallQualityBars';
import { ShareStage } from './ShareStage';
import { useSpeaking, useStreamOn } from './call-hooks';
import { openOnMinimize, shouldClosePip, allowAutoPip } from './pip-policy';
import { useDuckedVolume } from './use-ducking';
import { usePip } from './use-pip';
import { usePresence } from './use-presence';

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

function useFullscreen(target: RefObject<HTMLElement | null>): { supported: boolean; active: boolean; toggle: () => void } {
  const [active, setActive] = useState(false);
  const supported = typeof document !== 'undefined' && document.fullscreenEnabled === true;
  useEffect(() => {
    const update = () => setActive(document.fullscreenElement !== null && document.fullscreenElement === target.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, [target]);
  const toggle = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void target.current?.requestFullscreen().catch(() => undefined);
    }
  };
  return { supported, active, toggle };
}

export function CallScreen({ videoRef }: CallScreenProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const call = useCall();
  const { snapshot, minimized } = call;
  const { state } = snapshot;
  const localRef = useRef<HTMLVideoElement>(null);
  const screenRef = useRef<HTMLVideoElement>(null);
  const shareAudioRef = useRef<HTMLAudioElement>(null);
  const [pipDismissed, setPipDismissed] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);
  const [showShareVolume, setShowShareVolume] = useState(false);
  const peer = call.peerDisplay(state.peerId);
  const peerName = peer?.name ?? '';
  const avatar = peer ? AVATARS[peer.avatar] : undefined;
  const peerPhoto = useUserPhoto(peer ? state.peerId : null);
  const running = state.phase === 'active' || state.phase === 'reconnecting';
  const elapsed = useElapsed(state.connectedAt, running);
  const remoteSharing = running && snapshot.remoteScreenOn && snapshot.remoteScreenStream !== null;
  const isVideo = state.kind === 'video' || snapshot.cameraOn || snapshot.remoteCameraOn || remoteSharing;
  const remoteCamera = snapshot.remoteStream !== null && snapshot.remoteCameraOn;
  const localSharing = snapshot.screenSharing && snapshot.localScreenStream !== null;
  const layout = selectStageLayout({ running, remoteSharing, localSharing });
  const stageActive = layout.main !== null;
  const localStage = layout.main === 'local-screen';
  const stageStream = layout.main === 'remote-screen' ? snapshot.remoteScreenStream : localStage ? snapshot.localScreenStream : null;
  const showRemoteVideo = remoteCamera && !stageActive;
  const remoteShareAudio = remoteSharing && call.remoteShareHasAudio;
  const broadcast: BroadcastSettings | null =
    localSharing || remoteSharing
      ? {
          sharer: localSharing
            ? {
                movieMode: call.movieMode,
                onMovieMode: call.setMovieMode,
                hasAudio: call.shareHasAudio,
                volume: call.shareVolume,
                onVolume: call.setShareVolume,
                previewHidden: call.sharePreviewHidden,
                onPreviewHidden: call.setSharePreviewHidden,
              }
            : null,
          receiver: remoteSharing ? { hasAudio: remoteShareAudio, volume: call.streamVolume, onVolume: call.setStreamVolume } : null,
        }
      : null;
  const supportsOutput = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
  const remoteSpeaking = useSpeaking(snapshot.remoteStream, running && !snapshot.remoteMuted);
  const localSpeaking = useSpeaking(snapshot.localStream, running && !snapshot.muted);
  const shareAudioVolume = useDuckedVolume(call.remoteShareMovie, localSpeaking || remoteSpeaking, call.streamVolume);
  const fullscreen = useFullscreen(stageRef);
  const mode = pipMode();
  const pip = usePip({
    mode,
    videoFor: () => (stageActive ? screenRef.current : remoteCamera ? videoRef.current : null),
    active: running,
    auto: allowAutoPip({ running, video: isVideo, dismissed: pipDismissed }),
    onUserClose: () => setPipDismissed(true),
  });
  const pipAvailable = running && (mode === 'document' || (mode === 'video' && (stageActive || remoteCamera)));
  const { close: closePip } = pip;
  const pipMomentRef = useRef({ minimized, sharing: stageActive });

  useEffect(() => {
    const previous = pipMomentRef.current;
    const next = { minimized, sharing: stageActive };
    pipMomentRef.current = next;
    if (shouldClosePip(previous, next)) {
      closePip();
    }
    if (previous.sharing && !next.sharing) {
      setPipDismissed(false);
    }
  }, [minimized, stageActive, closePip]);

  const minimize = () => {
    setPipDismissed(false);
    if (openOnMinimize({ sharing: stageActive, available: pipAvailable, open: pip.open })) {
      void pip.openPip();
    }
    call.setMinimized(true);
  };

  useEffect(() => {
    const element = videoRef.current;
    if (!element) {
      return;
    }
    if (element.srcObject !== snapshot.remoteStream) {
      element.srcObject = snapshot.remoteStream;
    }
    if (snapshot.remoteStream) {
      autoplay.play(element);
    }
  }, [snapshot.remoteStream, videoRef, stageActive]);

  useStreamOn(localRef, snapshot.cameraOn ? snapshot.localStream : null);
  useStreamOn(shareAudioRef, remoteSharing ? snapshot.remoteScreenStream : null);
  useEffect(() => {
    if (shareAudioRef.current) {
      shareAudioRef.current.volume = shareAudioVolume;
    }
  }, [shareAudioVolume]);

  const chooseOutput = (deviceId: string) => {
    for (const element of [videoRef.current, shareAudioRef.current]) {
      void element?.setSinkId?.(deviceId).catch(() => undefined);
    }
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
  const screenStage = usePresence(!hidden, 260, 180);
  const bannerStage = usePresence(snapshot.screenSharing, 240, 180);
  const mutedBadge = (small: boolean) => (
    <span className={`sc-call-muted-badge${small ? ' sc-call-muted-badge--small' : ''}`} role="img" aria-label={t('calls.mutedBadge')}>
      <FaMicrophoneSlash size={small ? 11 : 13} />
    </span>
  );

  const remoteVideoStyle = stageActive
    ? { display: 'none' }
    : { position: 'absolute' as const, inset: 0, width: '100%', height: '100%', objectFit: 'cover' as const, display: showRemoteVideo ? 'block' : 'none' };

  const liveSurface = snapshot.screenSharing ? describeShareSurface(snapshot.localScreenStream) : null;
  const lastSurfaceRef = useRef(liveSurface);
  if (liveSurface) {
    lastSurfaceRef.current = liveSurface;
  }
  const shareSurface = liveSurface ?? lastSurfaceRef.current;
  const ownSurfaceText = `${t(`calls.share.surface.${shareSurface?.kind ?? 'unknown'}`)}${shareSurface?.label ? ` · ${shareSurface.label}` : ''}`;
  const sharePercent = Math.round(snapshot.shareVolume * 100);
  const peerSurfaceText = `${t(`calls.share.peerSurface.${snapshot.remoteScreenSurface ?? 'unknown'}`)}${snapshot.remoteScreenLabel ? ` · ${snapshot.remoteScreenLabel}` : ''}`;

  const remoteVideo = <video ref={videoRef} autoPlay playsInline style={remoteVideoStyle} />;

  return (
    <div role="dialog" aria-label={isVideo ? t('calls.start.video') : t('calls.start.voice')} className="sc-call-screen" data-state={screenStage} style={{ display: isMounted(screenStage) ? 'flex' : 'none' }}>
      {remoteVideo}
      <audio ref={shareAudioRef} autoPlay />
      <div className="sc-call-topbar">
        <div className="sc-call-topbar__group">
          <button type="button" className="sc-icon-btn sc-icon-btn--header sc-call-topbar__btn" onClick={minimize} title={t('calls.minimize')} aria-label={t('calls.minimize')}>
            <FaCompressAlt size={20} />
          </button>
        </div>
        <div className="sc-call-topbar__group">
          <CallQualityBars bars={snapshot.quality} relayed={snapshot.relayed} />
        </div>
      </div>

      {isMounted(bannerStage) && layout.main !== 'local-screen' && (
        <div className="sc-call-share-banner" role="status" data-state={bannerStage}>
          <span className="sc-call-share-banner__icon" aria-hidden="true">
            <MdScreenShare size={18} />
          </span>
          <span className="sc-call-share-banner__text">
            <strong>{t('calls.share.title')}</strong>
            <span className="sc-call-share-banner__detail">
              {t(`calls.share.surface.${shareSurface?.kind ?? 'unknown'}`)}
              {shareSurface?.label ? ` · ${shareSurface.label}` : ''}
            </span>
          </span>
          {snapshot.shareAudio && (
            <button
              type="button"
              className="sc-call-share-banner__volume-btn"
              onClick={() => setShowShareVolume((value) => !value)}
              title={t('calls.share.volume')}
              aria-label={t('calls.share.volume')}
              aria-expanded={showShareVolume}
            >
              {sharePercent === 0 ? <FaVolumeMute size={15} /> : <FaVolumeUp size={15} />}
            </button>
          )}
          <button type="button" className="sc-call-pill-btn" onClick={() => void call.toggleScreenShare()}>
            {t('calls.share.stopShort')}
          </button>
          {snapshot.shareAudio && showShareVolume && (
            <label className="sc-call-share-volume">
              <span className="sc-call-share-volume__label">{t('calls.share.volume')}</span>
              <span className="sc-call-share-volume__row">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={sharePercent}
                  onChange={(event) => call.setShareVolume(Number(event.target.value) / 100)}
                  aria-valuetext={`${sharePercent}%`}
                />
                <span className="sc-call-share-volume__value">{sharePercent}%</span>
              </span>
            </label>
          )}
        </div>
      )}

      {stageActive ? (
        <ShareStage
          key="stage"
          stream={stageStream}
          local={localStage}
          title={localStage ? t('calls.share.yourScreen') : t('calls.share.peerTitle', { name: peerName })}
          detail={localStage ? ownSurfaceText : peerSurfaceText}
          remote={{ name: peerName, avatar, photo: peerPhoto, stream: remoteCamera ? snapshot.remoteStream : null, speaking: remoteSpeaking, muted: snapshot.remoteMuted }}
          self={snapshot.cameraOn ? { name: t('calls.you'), avatar: undefined, stream: snapshot.localStream, speaking: localSpeaking, muted: snapshot.muted } : null}
          myScreen={layout.localScreenTile ? snapshot.localScreenStream : null}
          stageRef={stageRef}
          streamVideoRef={screenRef}
          fullscreen={{ available: fullscreen.supported, active: fullscreen.active, toggle: fullscreen.toggle }}
          pip={{ available: pipAvailable, open: pip.open, toggle: pip.toggle }}
          previewHidden={localStage && call.sharePreviewHidden}
          streamWindow={call.streamWindowAvailable ? { open: call.streamWindowOpen, onOpen: call.openStreamWindow } : null}
          onStop={localStage ? () => void call.toggleScreenShare() : null}
        />
      ) : (
        <>
          <div ref={infoRef} className="sc-call-info">
            {!showRemoteVideo && (
              <Avatar
                userId={peer ? state.peerId : null}
                avatarIndex={peer?.avatar}
                size={112}
                iconSize={52}
                className={`sc-call-avatar${remoteSpeaking ? ' sc-call-speaking' : ''}`}
                style={{ width: undefined, height: undefined }}
              >
                {snapshot.remoteMuted && running && mutedBadge(false)}
              </Avatar>
            )}
            {!showRemoteVideo && <h2 className="sc-call-name">{peerName}</h2>}
            <div aria-live="polite" style={{ fontSize: '1rem', color: showRemoteVideo ? '#ffffff' : theme.onGradientMuted, textShadow: showRemoteVideo ? '0 1px 3px rgba(0,0,0,0.6)' : undefined, fontVariantNumeric: 'tabular-nums' }}>
              {statusText}
            </div>
            {state.kind === 'video' && snapshot.remoteStream !== null && !snapshot.remoteCameraOn && <small style={{ color: theme.onGradientMuted }}>{t('calls.remoteCameraOff')}</small>}
          </div>
          <div className="sc-call-middle" />
        </>
      )}

      <div className="sc-call-bottom">
        {(warning || (snapshot.unstable && running)) && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            {snapshot.unstable && running && (
              <div role="status" className="sc-call-warning">
                <FaWifi size={13} aria-hidden="true" />
                {t('calls.unstable')}
              </div>
            )}
            {warning && (
              <div role="status" className="sc-call-warning">
                {warning}
              </div>
            )}
          </div>
        )}
        <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
          {snapshot.cameraOn && !stageActive && (
            <div className={`sc-call-self${localSpeaking ? ' sc-call-speaking' : ''}`}>
              <video ref={localRef} autoPlay playsInline muted />
              {snapshot.muted && mutedBadge(true)}
            </div>
          )}
          {state.phase === 'ended' ? (
            <button type="button" className="sc-btn sc-btn--primary" onClick={call.dismissEnded}>
              {t('calls.close')}
            </button>
          ) : (
            <CallControls supportsOutput={supportsOutput} onAudioOutput={chooseOutput} infoRef={infoRef} broadcast={broadcast} />
          )}
        </div>
      </div>
      {pip.window && (
        <CallPip
          target={pip.window}
          peerName={peerName}
          avatar={avatar}
          photo={peerPhoto}
          stream={stageActive ? stageStream : remoteCamera ? snapshot.remoteStream : null}
          speaking={remoteSpeaking}
          muted={snapshot.muted}
          remoteMuted={snapshot.remoteMuted}
          onToggleMute={call.toggleMute}
          onHangup={call.hangup}
          onClose={() => {
            setPipDismissed(true);
            pip.close();
          }}
        />
      )}
    </div>
  );
}
