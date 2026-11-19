import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCompress, FaCompressAlt, FaExpand, FaMicrophoneSlash, FaVolumeMute, FaVolumeUp, FaWifi } from 'react-icons/fa';
import { MdPictureInPictureAlt, MdScreenShare } from 'react-icons/md';
import { AVATARS, AVATAR_ICON_COLOR } from '@features/auth/constants/avatars';
import { useTheme } from '@features/theme';
import { useMediaQuery } from '@hooks/useMediaQuery';
import { formatCallDuration } from '@lib/format';
import { hasTranslation, translate } from '@lib/i18n/app-i18n';
import { useCall } from '../call-context';
import { pipMode } from '../lib/picture-in-picture';
import { isMounted } from '../lib/presence';
import { selectStageLayout } from '../lib/stage-layout';
import { describeShareSurface } from '../lib/share-surface';
import { CallControls } from './CallControls';
import { CallPip } from './CallPip';
import { CallQualityBars } from './CallQualityBars';
import { useSpeaking, useStreamOn } from './call-hooks';
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
  const localScreenTileRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const [showShareVolume, setShowShareVolume] = useState(false);
  const desktop = useMediaQuery('(min-width: 768px) and (pointer: fine)');
  const peer = call.peerDisplay(state.peerId);
  const peerName = peer?.name ?? '';
  const avatar = peer ? AVATARS[peer.avatar] : undefined;
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
  const supportsOutput = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
  const remoteSpeaking = useSpeaking(snapshot.remoteStream, running && !snapshot.remoteMuted);
  const localSpeaking = useSpeaking(snapshot.localStream, running && !snapshot.muted);
  const fullscreen = useFullscreen(stageRef);
  const mode = pipMode();
  const pip = usePip({
    mode,
    videoFor: () => (remoteSharing ? screenRef.current : remoteCamera ? videoRef.current : null),
    active: running,
    auto: running && isVideo,
  });
  const pipAvailable = running && (mode === 'document' || (mode === 'video' && (remoteSharing || remoteCamera)));

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
  }, [snapshot.remoteStream, videoRef, stageActive]);

  useStreamOn(localRef, snapshot.cameraOn ? snapshot.localStream : null);
  useEffect(() => {
    if (screenRef.current) {
      screenRef.current.muted = localStage;
    }
  });
  useStreamOn(screenRef, stageStream);
  useStreamOn(localScreenTileRef, layout.localScreenTile ? snapshot.localScreenStream : null);

  const chooseOutput = (deviceId: string) => {
    for (const element of [videoRef.current, screenRef.current]) {
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
    ? { width: '100%', height: '100%', objectFit: 'cover' as const, display: remoteCamera ? 'block' : 'none' }
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
      {!stageActive && remoteVideo}
      <div className="sc-call-topbar">
        <div className="sc-call-topbar__group">
          <button type="button" className="sc-icon-btn sc-icon-btn--header" onClick={() => call.setMinimized(true)} title={t('calls.minimize')} aria-label={t('calls.minimize')} style={{ width: '52px', height: '52px' }}>
            <FaCompressAlt size={22} />
          </button>
          {(stageActive || showRemoteVideo) && (
            <span className={`sc-call-chip${remoteSpeaking ? ' sc-call-speaking' : ''}`} style={{ maxWidth: 'min(260px, 50vw)' }}>
              <span>{peerName}</span>
              {snapshot.remoteMuted && <FaMicrophoneSlash size={11} aria-label={t('calls.mutedBadge')} />}
            </span>
          )}
        </div>
        <div className="sc-call-topbar__group">
          <CallQualityBars bars={snapshot.quality} />
          {pipAvailable && (
            <button
              type="button"
              className="sc-icon-btn sc-icon-btn--header"
              onClick={pip.toggle}
              title={pip.open ? t('calls.pip.close') : t('calls.pip.open')}
              aria-label={pip.open ? t('calls.pip.close') : t('calls.pip.open')}
              aria-pressed={pip.open}
              style={{ width: '44px', height: '44px' }}
            >
              <MdPictureInPictureAlt size={20} />
            </button>
          )}
        </div>
      </div>

      {isMounted(bannerStage) && (
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
        <div ref={stageRef} className="sc-call-stage" data-main={layout.main ?? undefined}>
          <video
            key={layout.main ?? 'none'}
            ref={screenRef}
            autoPlay
            playsInline
            muted={localStage}
            className="sc-call-stage__video"
            aria-label={localStage ? t('calls.share.yourScreen') : t('calls.share.remote', { name: peerName })}
          />
          <span key={`label-${layout.main ?? 'none'}`} className="sc-call-stage__label">
            <span className="sc-call-stage__label-title">{localStage ? t('calls.share.yourScreen') : t('calls.share.peerTitle', { name: peerName })}</span>
            <span className="sc-call-stage__label-detail">{localStage ? ownSurfaceText : peerSurfaceText}</span>
          </span>
          {desktop && fullscreen.supported && (
            <button
              type="button"
              className="sc-call-stage__fullscreen"
              onClick={fullscreen.toggle}
              title={fullscreen.active ? t('calls.share.exitFullscreen') : t('calls.share.fullscreen')}
              aria-label={fullscreen.active ? t('calls.share.exitFullscreen') : t('calls.share.fullscreen')}
            >
              {fullscreen.active ? <FaCompress size={15} /> : <FaExpand size={15} />}
            </button>
          )}
          <div className="sc-call-tiles">
            <div className={`sc-call-tile${remoteSpeaking ? ' sc-call-speaking' : ''}`}>
              {remoteVideo}
              {!remoteCamera && (
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: avatar?.bgGradient ?? theme.gradientControl, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {avatar ? <avatar.icon size={24} color={AVATAR_ICON_COLOR} /> : null}
                </div>
              )}
              <span className="sc-call-chip">
                <span>{peerName}</span>
              </span>
              {snapshot.remoteMuted && mutedBadge(true)}
            </div>
            {snapshot.cameraOn && (
              <div className={`sc-call-tile${localSpeaking ? ' sc-call-speaking' : ''}`}>
                <video ref={localRef} autoPlay playsInline muted style={{ transform: 'scaleX(-1)' }} />
                <span className="sc-call-chip">
                  <span>{t('calls.you')}</span>
                </span>
                {snapshot.muted && mutedBadge(true)}
              </div>
            )}
            {layout.localScreenTile && (
              <div className="sc-call-tile sc-call-tile--screen">
                <video ref={localScreenTileRef} autoPlay playsInline muted style={{ objectFit: 'contain', background: '#000000' }} />
                <span className="sc-call-chip">
                  <span>{t('calls.share.yourScreen')}</span>
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div ref={infoRef} className="sc-call-info">
            {!showRemoteVideo && (
              <div className={`sc-call-avatar${remoteSpeaking ? ' sc-call-speaking' : ''}`} style={{ background: avatar?.bgGradient ?? theme.gradientControl }}>
                {avatar ? <avatar.icon size={52} color={AVATAR_ICON_COLOR} /> : null}
                {snapshot.remoteMuted && running && mutedBadge(false)}
              </div>
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
        {needsTap && (
          <button type="button" className="sc-btn sc-btn--primary" onClick={() => void videoRef.current?.play().then(() => setNeedsTap(false))}>
            {t('calls.tapToResume')}
          </button>
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
            <CallControls supportsOutput={supportsOutput} onAudioOutput={chooseOutput} infoRef={infoRef} />
          )}
        </div>
      </div>
      {pip.window && (
        <CallPip
          target={pip.window}
          peerName={peerName}
          avatar={avatar}
          stream={remoteSharing ? snapshot.remoteScreenStream : remoteCamera ? snapshot.remoteStream : null}
          speaking={remoteSpeaking}
          muted={snapshot.muted}
          remoteMuted={snapshot.remoteMuted}
          onToggleMute={call.toggleMute}
          onHangup={call.hangup}
        />
      )}
    </div>
  );
}
