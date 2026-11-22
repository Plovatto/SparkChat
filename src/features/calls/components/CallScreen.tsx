import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { LuClock, LuEyeOff, LuLoaderCircle, LuMicOff, LuMinimize2, LuPhone, LuScreenShare, LuTriangleAlert, LuUser, LuVideo, LuVolume2, LuVolumeX, LuWifiOff } from 'react-icons/lu';
import { AVATARS } from '@features/auth/constants/avatars';
import { getStoredSession } from '@features/auth/api/session-storage';
import { Avatar } from '@features/profile-photos/components/Avatar';
import { useUserPhoto } from '@features/profile-photos';
import { formatCallDuration } from '@lib/format';
import { hasTranslation, translate } from '@lib/i18n/app-i18n';
import { useCall } from '../call-context';
import { autoplay } from '../lib/autoplay';
import { pipMode } from '../lib/picture-in-picture';
import { isMounted } from '../lib/presence';
import { CHROME_HIDE_MS, chromeAutoHides, chromeVisible, describeSurface, selectCallView, selectStageLayout } from '../lib/stage-layout';
import { OverlayVisibility } from '../lib/stage-focus';
import { describeShareSurface } from '../lib/share-surface';
import { useDuckLevel, useShareMonitorVolume } from '../lib/call-settings';
import { shareAudioTrack, shareMonitorSupport } from '../lib/share-monitor';
import { CallControls } from './CallControls';
import type { BroadcastSettings } from './DevicePicker';
import { CallPip } from './CallPip';
import { CallQualityBars } from './CallQualityBars';
import { ShareStage } from './ShareStage';
import { useSpeaking, useStreamOn } from './call-hooks';
import { openOnMinimize, shouldClosePip, allowAutoPip } from './pip-policy';
import { useDuckedVolume } from './use-ducking';
import { useShareMonitor } from './use-share-monitor';
import { usePip } from './use-pip';
import { usePresence } from './use-presence';
import '../styles/call-screen.css';

interface CallScreenProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  voiceRef: RefObject<HTMLAudioElement | null>;
  shareAudioRef: RefObject<HTMLAudioElement | null>;
  shareMonitorRef: RefObject<HTMLAudioElement | null>;
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

function isKeyboardFocus(target: EventTarget): boolean {
  try {
    return target instanceof Element && target.matches(':focus-visible');
  } catch {
    return false;
  }
}

interface NoteProps {
  icon: ReactNode;
  tone?: 'warning' | 'info';
  children: ReactNode;
}

function Note({ icon, tone = 'warning', children }: NoteProps) {
  return (
    <div role="status" className="sc-call-warning" data-tone={tone}>
      <span className="sc-call-warning__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="sc-call-warning__text">{children}</span>
    </div>
  );
}

export function CallScreen({ videoRef, voiceRef, shareAudioRef, shareMonitorRef }: CallScreenProps) {
  const { t } = useTranslation();
  const call = useCall();
  const { snapshot, minimized } = call;
  const { state } = snapshot;
  const localRef = useRef<HTMLVideoElement>(null);
  const screenRef = useRef<HTMLVideoElement>(null);
  const [shareMonitorVolume, setShareMonitorVolume] = useShareMonitorVolume();
  const [duckLevel, setDuckLevel] = useDuckLevel();
  const [pipDismissed, setPipDismissed] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
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
  const monitorSupport = localSharing ? shareMonitorSupport(snapshot.localScreenStream) : 'none';
  const monitorTrack = monitorSupport === 'local' ? shareAudioTrack(snapshot.localScreenStream) : null;
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
                monitor: monitorSupport,
                monitorVolume: shareMonitorVolume,
                onMonitorVolume: setShareMonitorVolume,
                duckLevel,
                onDuckLevel: setDuckLevel,
              }
            : null,
          receiver: remoteSharing
            ? { hasAudio: remoteShareAudio, volume: call.streamVolume, onVolume: call.setStreamVolume, movie: call.remoteShareMovie, duckLevel, onDuckLevel: setDuckLevel }
            : null,
        }
      : null;
  const supportsOutput = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
  const remoteSpeaking = useSpeaking(snapshot.remoteStream, running && !snapshot.remoteMuted);
  const localSpeaking = call.localSpeaking;
  const shareAudioVolume = useDuckedVolume(call.remoteShareMovie, localSpeaking || remoteSpeaking, call.streamVolume, duckLevel);
  const monitorVolume = useDuckedVolume(call.movieMode && monitorTrack !== null, localSpeaking || remoteSpeaking, shareMonitorVolume, duckLevel);
  useShareMonitor(shareMonitorRef, monitorTrack, monitorVolume);
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
  useEffect(() => {
    if (shareAudioRef.current) {
      shareAudioRef.current.volume = shareAudioVolume;
    }
  }, [shareAudioVolume, shareAudioRef]);

  const chooseOutput = (deviceId: string) => {
    for (const element of [voiceRef.current, shareAudioRef.current, shareMonitorRef.current]) {
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

  const endedWarning = state.phase === 'ended' && state.detail && hasTranslation(`calls.detail.${state.detail}`) ? translate(`calls.detail.${state.detail}`) : null;

  const warning = (() => {
    if (state.phase === 'ended') {
      return null;
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

  const sharerPaused = snapshot.screenSharing && snapshot.screenPaused;
  const hidden = minimized || state.phase === 'idle' || state.phase === 'incoming-ringing';
  const screenStage = usePresence(!hidden, 260, 180);
  const bannerStage = usePresence(snapshot.screenSharing && layout.main !== 'local-screen', 240, 180);
  const me = useMemo(() => (hidden ? null : getStoredSession()), [hidden]);
  const meAvatar = me && AVATARS[me.avatar] ? me.avatar : undefined;
  const myPhoto = useUserPhoto(me?.id ?? null);
  const ended = state.phase === 'ended';
  const ringing = state.phase === 'outgoing-ringing' || state.phase === 'connecting';
  const reconnecting = state.phase === 'reconnecting';
  const view = selectCallView({ ended, stageActive, remoteVideo: showRemoteVideo });
  const cinema = stageActive && (call.remoteShareMovie || (localStage && call.movieMode));

  const [panelOpen, setPanelOpen] = useState(false);
  const [recentActivity, setRecentActivity] = useState(true);
  const [hoverChrome, setHoverChrome] = useState(false);
  const [focusChrome, setFocusChrome] = useState(false);
  const chromeTimerRef = useRef<OverlayVisibility | null>(null);
  chromeTimerRef.current ??= new OverlayVisibility(setRecentActivity, CHROME_HIDE_MS);
  const chromeTimer = chromeTimerRef.current;
  const autoHide = chromeAutoHides({ view, phase: state.phase, panelOpen });
  const pinned = panelOpen || hoverChrome || focusChrome;
  const chromeShown = chromeVisible({ autoHide, pinned, recentActivity });

  useEffect(() => {
    if (autoHide && !pinned) {
      chromeTimer.activity();
    }
  }, [autoHide, pinned, chromeTimer]);

  useEffect(() => () => chromeTimer.dispose(), [chromeTimer]);

  const onPanelChange = useCallback((open: boolean) => setPanelOpen(open), []);

  const onScreenPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (autoHide && event.pointerType === 'mouse') {
      chromeTimer.activity();
    }
  };

  const onScreenPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (autoHide && event.pointerType !== 'mouse') {
      chromeTimer.activity();
    }
  };

  const chromeHandlers = {
    onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse') {
        setHoverChrome(true);
      }
    },
    onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse') {
        setHoverChrome(false);
      }
    },
    onFocus: (event: FocusEvent<HTMLElement>) => setFocusChrome(isKeyboardFocus(event.target)),
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) {
        setFocusChrome(false);
      }
    },
  };

  const mutedBadge = (small: boolean) => (
    <span className={`sc-call-muted-badge${small ? ' sc-call-muted-badge--small' : ''}`} role="img" aria-label={t('calls.mutedBadge')}>
      <LuMicOff size={small ? 12 : 15} />
    </span>
  );

  const liveSurface = snapshot.screenSharing ? describeShareSurface(snapshot.localScreenStream) : null;
  const lastSurfaceRef = useRef(liveSurface);
  if (liveSurface) {
    lastSurfaceRef.current = liveSurface;
  }
  const shareSurface = liveSurface ?? lastSurfaceRef.current;
  const ownKind = shareSurface?.kind ?? 'unknown';
  const ownSurfaceText = describeSurface(t(`calls.share.surface.${ownKind}`), shareSurface?.label, ownKind === 'unknown');
  const sharePercent = Math.round(snapshot.shareVolume * 100);
  const peerKind = snapshot.remoteScreenSurface ?? 'unknown';
  const peerSurfaceText = describeSurface(t(`calls.share.peerSurface.${peerKind}`), snapshot.remoteScreenLabel, peerKind === 'unknown');

  const nameChip = (name: string, muted: boolean, extra = '') => (
    <span className={`sc-call-chip sc-call-name-chip${extra}`}>
      <span>{name}</span>
      {muted && <LuMicOff size={14} className="sc-call-name-chip__muted" aria-hidden="true" />}
    </span>
  );

  const selfMedia = snapshot.cameraOn ? (
    <video ref={localRef} autoPlay playsInline muted className="sc-call-self-video" />
  ) : (
    <span className="sc-call-person__halo">
      <Avatar
        userId={me?.id ?? null}
        avatarIndex={meAvatar}
        icon={meAvatar === undefined ? LuUser : undefined}
        size={112}
        iconSize={48}
        className="sc-call-avatar sc-call-avatar--self"
        style={{ width: undefined, height: undefined }}
      />
    </span>
  );

  const aura = (userId: string | null, avatarIndex: number | undefined, icon?: typeof LuUser) => (
    <span className="sc-call-aura" aria-hidden="true">
      <Avatar userId={userId} avatarIndex={avatarIndex} icon={icon} size={8} iconSize={1} className="sc-call-aura__fill" style={{ width: undefined, height: undefined }} />
    </span>
  );

  const peerTile = (
    <div className={`sc-call-person${remoteSpeaking ? ' is-speaking' : ''}`} data-ringing={ringing} data-dim={reconnecting} style={{ '--tile-index': 0 } as CSSProperties}>
      {aura(peer ? state.peerId : null, peer?.avatar)}
      <div className="sc-call-person__center">
        <span className="sc-call-person__halo">
          {ringing && (
            <span className="sc-call-sonar" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          )}
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
        </span>
        {(ringing || reconnecting) && (
          <span className="sc-call-person__status" aria-hidden="true">
            {reconnecting && <LuLoaderCircle size={15} className="sc-call-spin" />}
            {statusText}
          </span>
        )}
        {state.kind === 'video' && snapshot.remoteStream !== null && !snapshot.remoteCameraOn && (
          <span className="sc-call-person__status">
            <LuVideo size={14} aria-hidden="true" />
            {t('calls.remoteCameraOff')}
          </span>
        )}
      </div>
      {nameChip(peerName, snapshot.remoteMuted && running)}
    </div>
  );

  const selfTile = (
    <div className={`sc-call-person sc-call-person--self${localSpeaking ? ' is-speaking' : ''}`} data-video={snapshot.cameraOn} style={{ '--tile-index': 1 } as CSSProperties}>
      {!snapshot.cameraOn && aura(me?.id ?? null, meAvatar, meAvatar === undefined ? LuUser : undefined)}
      <div className="sc-call-person__center">{selfMedia}</div>
      {nameChip(t('calls.you'), snapshot.muted)}
    </div>
  );

  const endedCard = (
    <div className="sc-call-ended">
      {aura(peer ? state.peerId : null, peer?.avatar)}
      <Avatar userId={peer ? state.peerId : null} avatarIndex={peer?.avatar} size={96} iconSize={44} className="sc-call-avatar sc-call-avatar--ended" style={{ width: undefined, height: undefined }} />
      <h2 className="sc-call-name">{peerName}</h2>
      <p className="sc-call-ended__title">{statusText}</p>
      {state.connectedAt !== null && elapsed > 0 && (
        <p className="sc-call-ended__meta">
          <LuClock size={14} aria-hidden="true" />
          {t('calls.endedDuration', { time: formatCallDuration(elapsed) })}
        </p>
      )}
      {endedWarning && (
        <div role="status" className="sc-call-callout">
          <LuTriangleAlert size={18} aria-hidden="true" />
          <span>{endedWarning}</span>
        </div>
      )}
      <div className="sc-call-ended__actions">
        {state.roomId && state.kind && state.detail !== 'fingerprint-mismatch' && (
          <button
            type="button"
            className="sc-call-action"
            onClick={() => {
              const roomId = state.roomId;
              const kind = state.kind;
              call.dismissEnded();
              if (roomId && kind) {
                call.startCallInRoom(roomId, kind);
              }
            }}
          >
            <LuPhone size={16} aria-hidden="true" />
            {t('calls.callBack')}
          </button>
        )}
        <button type="button" className="sc-btn sc-btn--primary sc-call-action sc-call-action--primary" onClick={call.dismissEnded}>
          {t('calls.close')}
        </button>
      </div>
    </div>
  );

  const remoteVideo = <video ref={videoRef} autoPlay playsInline muted className="sc-call-feed__video" />;
  const notes = (snapshot.unstable && running) || sharerPaused || warning || isMounted(bannerStage);

  return (
    <div
      role="dialog"
      aria-label={isVideo ? t('calls.start.video') : t('calls.start.voice')}
      className="sc-call-screen"
      data-state={screenStage}
      data-view={view}
      data-chrome={chromeShown ? 'shown' : 'hidden'}
      data-cinema={cinema}
      style={{ display: isMounted(screenStage) ? 'flex' : 'none' }}
      onPointerMove={onScreenPointerMove}
      onPointerDown={onScreenPointerDown}
      onKeyDown={() => {
        if (autoHide) {
          chromeTimer.activity();
        }
      }}
    >
      <div className="sc-call-bg" aria-hidden="true">
        <span className="sc-call-bg__blob sc-call-bg__blob--a" />
        <span className="sc-call-bg__blob sc-call-bg__blob--b" />
        <span className="sc-call-bg__blob sc-call-bg__blob--c" />
        <span className="sc-call-bg__blob sc-call-bg__blob--d" />
      </div>

      <header ref={topRef} className="sc-call-topbar sc-call-chrome sc-call-chrome--top" {...chromeHandlers}>
        <div className="sc-call-topbar__group sc-call-glass">
          <button type="button" className="sc-call-topbar__btn" onClick={minimize} title={t('calls.minimize')} aria-label={t('calls.minimize')}>
            <LuMinimize2 size={20} />
          </button>
          {!ended && (
            <div className="sc-call-topbar__meta">
              <span className="sc-call-topbar__name">{peerName}</span>
              <span className="sc-call-topbar__dot" data-live={state.phase === 'active'} aria-hidden="true" />
              <span className="sc-call-topbar__status" aria-live="polite">
                {state.kind === 'video' ? <LuVideo size={13} aria-hidden="true" /> : <LuPhone size={13} aria-hidden="true" />}
                <span>{statusText}</span>
              </span>
            </div>
          )}
          {ended && (
            <span className="sc-call-topbar__status sc-call-visually-hidden" aria-live="polite">
              {statusText}
            </span>
          )}
        </div>
        {snapshot.quality !== null && !ended && (
          <div className="sc-call-topbar__group sc-call-glass sc-call-topbar__quality">
            <CallQualityBars bars={snapshot.quality} relayed={snapshot.relayed} />
          </div>
        )}
      </header>

      {notes && (
        <div className="sc-call-notes">
          {snapshot.unstable && running && <Note icon={<LuWifiOff size={16} />}>{t('calls.unstable')}</Note>}
          {sharerPaused && <Note icon={<LuEyeOff size={16} />}>{t('calls.share.pausedSharer')}</Note>}
          {warning && <Note icon={<LuTriangleAlert size={16} />}>{warning}</Note>}
          {isMounted(bannerStage) && (
            <div className="sc-call-share-banner" role="status" data-state={bannerStage}>
              <span className="sc-call-share-banner__icon" aria-hidden="true">
                <LuScreenShare size={17} />
              </span>
              <span className="sc-call-share-banner__text">
                <strong>{t('calls.share.title')}</strong>
                {ownSurfaceText && <span className="sc-call-share-banner__detail">{ownSurfaceText}</span>}
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
                  {sharePercent === 0 ? <LuVolumeX size={16} /> : <LuVolume2 size={16} />}
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
        </div>
      )}

      <main className="sc-call-body">
        <div className="sc-call-feed" data-dim={reconnecting} style={{ display: view === 'video' ? undefined : 'none' }}>
          {remoteVideo}
          {view === 'video' && nameChip(peerName, snapshot.remoteMuted, ' sc-call-feed__name')}
          {view === 'video' && reconnecting && (
            <span className="sc-call-feed__status">
              <LuLoaderCircle size={18} className="sc-call-spin" aria-hidden="true" />
              {statusText}
            </span>
          )}
          {view === 'video' && snapshot.cameraOn && (
            <div className={`sc-call-self${localSpeaking ? ' sc-call-speaking' : ''}`}>
              <video ref={localRef} autoPlay playsInline muted className="sc-call-self-video" />
              {nameChip(t('calls.you'), snapshot.muted, ' sc-call-self__name')}
            </div>
          )}
        </div>

        {view === 'tiles' && (
          <div className="sc-call-tiles">
            {peerTile}
            {selfTile}
          </div>
        )}

        {view === 'share' && (
          <ShareStage
            key="stage"
            stream={stageStream}
            local={localStage}
            title={localStage ? t('calls.share.yourScreen') : t('calls.share.peerTitle', { name: peerName })}
            detail={localStage ? ownSurfaceText : peerSurfaceText}
            remote={{ name: peerName, avatar, photo: peerPhoto, stream: remoteCamera ? snapshot.remoteStream : null, speaking: remoteSpeaking, muted: snapshot.remoteMuted }}
            self={{ name: t('calls.you'), avatar: meAvatar === undefined ? undefined : AVATARS[meAvatar], photo: myPhoto, stream: snapshot.cameraOn ? snapshot.localStream : null, speaking: localSpeaking, muted: snapshot.muted }}
            myScreen={layout.localScreenTile ? snapshot.localScreenStream : null}
            stageRef={stageRef}
            streamVideoRef={screenRef}
            fullscreen={{ available: fullscreen.supported, active: fullscreen.active, toggle: fullscreen.toggle }}
            pip={{ available: pipAvailable, open: pip.open, toggle: pip.toggle }}
            previewHidden={localStage && call.sharePreviewHidden}
            paused={!localStage && snapshot.remoteScreenPaused}
            streamWindow={call.streamWindowAvailable ? { open: call.streamWindowOpen, onOpen: call.openStreamWindow } : null}
            onStop={localStage ? () => void call.toggleScreenShare() : null}
            cinema={cinema}
          />
        )}

        {view === 'ended' && endedCard}
      </main>

      {!ended && (
        <footer className="sc-call-dock sc-call-chrome sc-call-chrome--bottom" {...chromeHandlers}>
          <CallControls supportsOutput={supportsOutput} onAudioOutput={chooseOutput} infoRef={topRef} broadcast={broadcast} onPanelChange={onPanelChange} />
        </footer>
      )}
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
