import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PropsWithChildren, type ReactNode } from 'react';
import { isAssistantRoom } from '@features/chat/utils/assistant';
import { translate } from '@lib/i18n/app-i18n';
import { getCurrentIdentity } from '@lib/e2ee';
import type { CallKind } from '@lib/e2ee/call-crypto';
import { useSocket, type RoomSummary } from '@lib/socket';
import { useSpeaking } from './components/call-hooks';
import { CallContext, LocalSpeakingContext, type CallApi, type PeerDisplay } from './call-context';
import { CallAudio } from './components/CallAudio';
import { CallMiniBar } from './components/CallMiniBar';
import { CallNotices } from './components/CallNotices';
import { CallScreen } from './components/lazy-call-screen';
import { IncomingCallModal } from './components/IncomingCallModal';
import { CallController, EMPTY_CALL_SNAPSHOT, type CallSocket } from './lib/call-controller';
import { isPrivateRoomWith, resolvePinnedPeer } from './lib/call-peer';
import { clearLegacyCallSettings, devicePrefs, getAudioProcessing, getMovieMode, getShareVolume, micVolume, setAudioProcessing, setMovieMode, setShareVolume, type AudioProcessing } from './lib/call-settings';
import { acquireCameraTrack, acquireLocalMedia, acquireMicrophoneTrack, acquireScreenShare, applyShareConstraints, isMobileDevice, listDevices, stopStream, supportsScreenShare, usesAdvancedNoise, resetKnownDevices } from './lib/media-devices';
import { routeCallOutput } from './lib/audio-output';
import { deviceFallback } from './lib/device-watch';
import { showSelfSpeaking } from './lib/self-speaking';
import { autoplay } from './lib/autoplay';
import { PeerSession } from './lib/peer-session';
import { copyStyles, STREAM_WINDOW_SIZE, streamWindowMode, type DocumentPipHost } from './lib/picture-in-picture';
import { useBackgroundAnchor } from './components/use-background-anchor';
import { needsBackgroundAnchor } from './lib/background-anchor';
import { useCallMediaSession } from './components/use-media-session';
import { StreamWindow } from './components/StreamWindow';
import { createShareAudio } from './lib/share-audio';
import { createVoiceLeveler, primeVoiceContext, releasePrimedVoiceContext } from './lib/voice-leveler';
import { startRingtone, stopRingtone } from './lib/ringtone';
import { createBrowserTabOwnership } from './lib/tab-ownership';
import { acquireWakeLock, releaseWakeLock } from './lib/wake-lock';
import { subscribeNotificationCallActions } from './lib/notification-actions';
import { tabDeviceToken } from './lib/tab-device';
import './styles/calls.css';
import './styles/incoming-call.css';
import './styles/call-bar.css';

interface CallProviderProps {
  rooms: RoomSummary[];
  onScreenCoverChange?: (covering: boolean, uncover: () => void) => void;
}

const noopSubscribe = () => () => undefined;
const DEVICE_CHANGE_SETTLE_MS = 300;
const emptySnapshot = () => EMPTY_CALL_SNAPSHOT;

function isBlocked(room: RoomSummary): boolean {
  return room.userBlocked || room.isBlockedBy || room.isMutuallyBlocked;
}

export function CallProvider({ rooms, onScreenCoverChange, children }: PropsWithChildren<CallProviderProps>) {
  const { socket } = useSocket();
  const [controller, setController] = useState<CallController | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [streamVolume, setStreamVolume] = useState(1);
  const [sharePreviewHidden, setSharePreviewHidden] = useState(false);
  const [streamWindow, setStreamWindow] = useState<Window | null>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const voiceRef = useRef<HTMLAudioElement>(null);
  const shareAudioRef = useRef<HTMLAudioElement>(null);
  const shareMonitorRef = useRef<HTMLAudioElement>(null);
  const roomsRef = useRef(rooms);
  roomsRef.current = rooms;

  useEffect(() => {
    clearLegacyCallSettings();
  }, []);

  useEffect(() => {
    if (!socket) {
      return;
    }
    const tabs = createBrowserTabOwnership();
    const instance = new CallController({
      socket: socket as unknown as CallSocket,
      getIdentity: getCurrentIdentity,
      resolvePeer: (userId) => resolvePinnedPeer(socket, userId),
      isPrivateRoomWith: (roomId, selfId, peerId) => isPrivateRoomWith(roomsRef.current, roomId, selfId, peerId),
      tabs,
      acquireMedia: (kind) => {
        const prefs = devicePrefs.get();
        return acquireLocalMedia(kind, { audioProcessing: getAudioProcessing(), audioInputId: prefs.audioInput || undefined, videoInputId: prefs.videoInput || undefined, facing: prefs.facing });
      },
      acquireCamera: () => {
        const prefs = devicePrefs.get();
        return acquireCameraTrack({ videoInputId: prefs.videoInput || undefined, facing: prefs.facing });
      },
      acquireMicrophone: () => acquireMicrophoneTrack({ audioInputId: devicePrefs.get().audioInput || undefined, audioProcessing: getAudioProcessing() }),
      acquireScreen: () => acquireScreenShare(),
      createShareAudio: (track, volume) => createShareAudio(track, volume),
      getShareVolume,
      saveShareVolume: setShareVolume,
      getMovieMode,
      saveMovieMode: setMovieMode,
      applyShareConstraints,
      stopMedia: stopStream,
      createPeerSession: (options) => new PeerSession(options),
      createVoiceLeveler: (track) => createVoiceLeveler(track, micVolume.get(), { denoise: () => usesAdvancedNoise(getAudioProcessing()) }),
      isMobile: isMobileDevice,
      startRingtone,
      stopRingtone,
      acquireWakeLock: () => void acquireWakeLock(),
      releaseWakeLock,
      now: () => Date.now(),
      tabDevice: () => tabDeviceToken(),
    });
    setController(instance);
    return () => {
      instance.dispose();
      tabs.dispose();
      setController(null);
    };
  }, [socket]);

  useEffect(() => {
    if (!controller) {
      return;
    }
    return micVolume.subscribe(() => controller.setMicVolume(micVolume.get()));
  }, [controller]);

  const snapshot = useSyncExternalStore(controller ? controller.subscribe : noopSubscribe, controller ? controller.getSnapshot : emptySnapshot);
  const phase = snapshot.state.phase;
  const coversChat = !minimized && phase !== 'idle' && phase !== 'incoming-ringing';

  useEffect(() => {
    onScreenCoverChange?.(coversChat, () => setMinimized(true));
  }, [coversChat, onScreenCoverChange]);

  useEffect(() => {
    if (phase === 'idle' || phase === 'ended') {
      resetKnownDevices();
      releasePrimedVoiceContext();
    }
  }, [phase]);

  useEffect(() => {
    if (phase === 'idle') {
      setMinimized(false);
    }
  }, [phase]);

  const [outputFallback, setOutputFallback] = useState(false);
  const mediaRootRef = useRef<HTMLDivElement>(null);
  const callRunning = phase !== 'idle' && phase !== 'ended';
  const outputRef = useRef('');
  outputRef.current = outputFallback ? '' : devicePrefs.get().audioOutput;

  useEffect(() => {
    if (!callRunning) {
      return;
    }
    const route = routeCallOutput(mediaRootRef.current ?? document.body, () => outputRef.current);
    const stop = devicePrefs.subscribe(() => {
      outputRef.current = outputFallback ? '' : devicePrefs.get().audioOutput;
      route.refresh();
    });
    return () => {
      stop();
      route.dispose();
    };
  }, [callRunning, outputFallback]);

  const localStreamRef = useRef<MediaStream | null>(null);
  localStreamRef.current = snapshot.localStream;
  const cameraOnRef = useRef(false);
  cameraOnRef.current = snapshot.cameraOn;
  const mediaRunning = phase === 'active' || phase === 'reconnecting';

  useEffect(() => {
    if (!controller || !mediaRunning || !navigator.mediaDevices?.addEventListener) {
      return;
    }
    let cancelled = false;
    let busy = false;
    let again = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = async () => {
      if (busy) {
        again = true;
        return;
      }
      busy = true;
      try {
        const lists = await listDevices();
        if (cancelled) {
          return;
        }
        const stream = localStreamRef.current;
        const prefs = devicePrefs.get();
        const verdict = deviceFallback(lists, { mic: stream?.getAudioTracks()[0] ?? null, camera: cameraOnRef.current ? (stream?.getVideoTracks()[0] ?? null) : null, prefs });
        setOutputFallback(verdict.output !== prefs.audioOutput);
        await Promise.all([verdict.mic ? controller.switchMicrophone() : null, verdict.camera ? controller.switchCamera() : null]);
      } finally {
        busy = false;
        if (again && !cancelled) {
          again = false;
          schedule();
        }
      }
    };
    const schedule = () => {
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        void check();
      }, DEVICE_CHANGE_SETTLE_MS);
    };
    void check();
    navigator.mediaDevices.addEventListener('devicechange', schedule);
    return () => {
      cancelled = true;
      if (timer !== null) {
        clearTimeout(timer);
      }
      navigator.mediaDevices.removeEventListener?.('devicechange', schedule);
    };
  }, [controller, mediaRunning]);

  const rememberFacing = useCallback(() => {
    const facing = localStreamRef.current?.getVideoTracks()[0]?.getSettings?.().facingMode;
    if (facing === 'user' || facing === 'environment') {
      devicePrefs.set({ facing });
    }
  }, []);
  const [statusBars, setStatusBars] = useState(0);
  const registerStatusBar = useCallback(() => {
    setStatusBars((count) => count + 1);
    return () => setStatusBars((count) => Math.max(0, count - 1));
  }, []);

  const primePlayback = useCallback(() => {
    autoplay.play(voiceRef.current);
  }, []);

  const primeCallAudio = useCallback(() => {
    primePlayback();
    primeVoiceContext({ denoise: usesAdvancedNoise(getAudioProcessing()) });
  }, [primePlayback]);

  useEffect(() => {
    if (!controller) {
      return;
    }
    return subscribeNotificationCallActions((action) => {
      if (action.type === 'answer') {
        primeCallAudio();
        setMinimized(false);
      }
      controller.handleNotificationAction(action);
    });
  }, [controller, primeCallAudio]);

  const startCallInRoom = useCallback(
    (roomId: string, kind: CallKind) => {
      const room = roomsRef.current.find((candidate) => candidate.id === roomId);
      const identity = getCurrentIdentity();
      const peerId = room?.participants.find((participant) => participant.id !== identity?.userId)?.id;
      if (!controller || !room || !peerId || room.type !== 'private' || isAssistantRoom(room) || isBlocked(room)) {
        return;
      }
      primeCallAudio();
      setMinimized(false);
      void controller.startCall({ roomId, peerId, kind });
    },
    [controller, primeCallAudio],
  );

  const screenShareSupported = supportsScreenShare();
  const sharedStream = snapshot.remoteScreenOn && snapshot.remoteScreenStream ? snapshot.remoteScreenStream : snapshot.screenSharing ? snapshot.localScreenStream : null;
  const sharedPeerName = roomsRef.current.flatMap((room) => room.participants).find((participant) => participant.id === snapshot.state.peerId)?.nickname ?? '';
  const sharedTitle = snapshot.remoteScreenOn ? translate('calls.share.peerTitle', { name: sharedPeerName }) : translate('calls.share.yourScreen');

  useEffect(() => {
    if (!snapshot.screenSharing) {
      setSharePreviewHidden(false);
    }
  }, [snapshot.screenSharing]);

  useEffect(() => {
    if (!sharedStream && streamWindow) {
      streamWindow.close();
      setStreamWindow(null);
    }
  }, [sharedStream, streamWindow]);

  const mediaSessionActive = phase === 'outgoing-ringing' || phase === 'connecting' || phase === 'active' || phase === 'reconnecting';
  const anchorSupported = needsBackgroundAnchor();
  const reviveAnchor = useBackgroundAnchor(mediaSessionActive);
  useCallMediaSession(mediaSessionActive, {
    onResume: anchorSupported ? reviveAnchor : undefined,
    title: sharedPeerName || translate('calls.mediaSession.title'),
    artist: translate(snapshot.state.kind === 'video' ? 'calls.mediaSession.video' : 'calls.mediaSession.voice'),
    muted: snapshot.muted,
    onHangup: () => controller?.hangup(),
    onToggleMicrophone: () => controller?.toggleMute(),
  });

  const fullscreenStage = useCallback(() => {
    const stage = document.querySelector<HTMLElement>('.sc-call-stage');
    void stage?.requestFullscreen?.().catch(() => undefined);
  }, []);

  const openStreamWindow = useCallback(() => {
    const mode = streamWindowMode();
    if (mode === 'document') {
      const host = (window as Window & { documentPictureInPicture?: DocumentPipHost }).documentPictureInPicture;
      void host
        ?.requestWindow({ ...STREAM_WINDOW_SIZE })
        .then((opened) => {
          copyStyles(document, opened.document);
          opened.addEventListener('pagehide', () => setStreamWindow(null), { once: true });
          setStreamWindow(opened);
        })
        .catch(() => fullscreenStage());
      return;
    }
    if (mode === 'fullscreen') {
      fullscreenStage();
    }
  }, [fullscreenStage]);

  const api: CallApi = {
    movieMode: snapshot.movieMode,
    shareVolume: snapshot.shareVolume,
    streamVolume,
    setStreamVolume: (volume) => setStreamVolume(Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 1))),
    sharePreviewHidden,
    setSharePreviewHidden,
    shareHasAudio: snapshot.screenSharing && snapshot.shareAudio,
    remoteShareHasAudio: snapshot.remoteScreenOn && snapshot.remoteScreenAudio,
    remoteShareMovie: snapshot.remoteScreenOn && snapshot.remoteScreenMovie,
    streamWindowAvailable: streamWindowMode() !== null,
    streamWindowOpen: streamWindow !== null,
    openStreamWindow,
    snapshot,
    minimized,
    setMinimized,
    canCall: (room) => snapshot.enabled && room.type === 'private' && !isAssistantRoom(room) && !isBlocked(room),
    startCall: (room, kind) => startCallInRoom(room.id, kind),
    startCallInRoom,
    accept: () => {
      primeCallAudio();
      setMinimized(false);
      void controller?.accept();
    },
    decline: () => controller?.decline(),
    silence: () => controller?.silence(),
    hangup: () => controller?.hangup(),
    toggleMute: () => controller?.toggleMute(),
    toggleCamera: () => void controller?.toggleCamera(),
    toggleScreenShare: () => void controller?.toggleScreenShare(),
    setShareVolume: (volume) => controller?.setShareVolume(volume),
    setMovieMode: (movie) => void controller?.setMovieMode(movie),
    canShareScreen: screenShareSupported,
    dismissNotice: () => controller?.dismissNotice(),
    dismissEnded: () => controller?.dismissEnded(),
    endOtherDeviceCall: () => controller?.endOtherDeviceCall(),
    transferHere: () => {
      primePlayback();
      setMinimized(false);
      void controller?.transferHere();
    },
    changeAudioInput: (deviceId) => {
      devicePrefs.set({ audioInput: deviceId });
      void controller?.switchMicrophone();
    },
    changeVideoInput: (deviceId) => {
      devicePrefs.set({ videoInput: deviceId });
      void controller?.switchCamera().then(rememberFacing);
    },
    changeAudioOutput: (deviceId) => {
      setOutputFallback(false);
      devicePrefs.set({ audioOutput: deviceId });
    },
    changeAudioProcessing: (patch: Partial<AudioProcessing>) => {
      setAudioProcessing(patch);
      void controller?.switchMicrophone();
    },
    changeScreenSource: () => void controller?.changeScreenSource(),
    primePlayback,
    hasStatusBar: statusBars > 0,
    registerStatusBar,
    peerDisplay: (peerId): PeerDisplay | null => {
      if (!peerId) {
        return null;
      }
      for (const room of roomsRef.current) {
        const participant = room.participants.find((candidate) => candidate.id === peerId);
        if (participant) {
          return { id: participant.id, name: participant.nickname, avatar: participant.avatar };
        }
      }
      return { id: peerId, name: '', avatar: 0 };
    },
  };

  return (
    <CallContext value={api}>
      <LocalSpeakingScope stream={snapshot.localStream} enabled={(phase === 'active' || phase === 'reconnecting') && !snapshot.muted} muted={snapshot.muted}>
        {children}
        <div ref={mediaRootRef} style={{ display: 'contents' }}>
          <CallAudio voiceRef={voiceRef} shareRef={shareAudioRef} monitorRef={shareMonitorRef} />
        </div>
        <CallScreen videoRef={remoteRef} shareAudioRef={shareAudioRef} shareMonitorRef={shareMonitorRef} />
        <CallMiniBar />
        <IncomingCallModal />
        <CallNotices />
        {streamWindow && sharedStream && (
          <StreamWindow
            target={streamWindow}
            stream={sharedStream}
            title={sharedTitle}
            onFullscreen={() => {
              streamWindow.close();
              setStreamWindow(null);
              fullscreenStage();
            }}
          />
        )}
      </LocalSpeakingScope>
    </CallContext>
  );
}

function LocalSpeakingScope({ stream, enabled, muted, children }: { stream: MediaStream | null; enabled: boolean; muted: boolean; children: ReactNode }) {
  const speaking = showSelfSpeaking(useSpeaking(stream, enabled), muted);
  return <LocalSpeakingContext value={speaking}>{children}</LocalSpeakingContext>;
}
