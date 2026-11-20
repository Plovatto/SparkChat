import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { isAssistantRoom } from '@features/chat/utils/assistant';
import { translate } from '@lib/i18n/app-i18n';
import { getCurrentIdentity } from '@lib/e2ee';
import type { CallKind } from '@lib/e2ee/call-crypto';
import { useSocket, type RoomSummary } from '@lib/socket';
import { useSpeaking } from './components/call-hooks';
import { CallContext, type CallApi, type PeerDisplay } from './call-context';
import { CallMiniBar } from './components/CallMiniBar';
import { CallNotices } from './components/CallNotices';
import { CallScreen } from './components/CallScreen';
import { IncomingCallModal } from './components/IncomingCallModal';
import { CallController, EMPTY_CALL_SNAPSHOT, type CallSocket } from './lib/call-controller';
import { isPrivateRoomWith, resolvePinnedPeer } from './lib/call-peer';
import { clearLegacyCallSettings, getAudioProcessing, getMovieMode, getShareVolume, micVolume, setAudioProcessing, setMovieMode, setShareVolume, type AudioProcessing } from './lib/call-settings';
import { acquireCameraTrack, acquireLocalMedia, acquireScreenShare, applyShareConstraints, audioConstraints, isMobileDevice, stopStream, supportsScreenShare, usesAdvancedNoise, videoConstraints, resetKnownDevices } from './lib/media-devices';
import { showSelfSpeaking } from './lib/self-speaking';
import { autoplay } from './lib/autoplay';
import { PeerSession } from './lib/peer-session';
import { copyStyles, STREAM_WINDOW_SIZE, streamWindowMode, type DocumentPipHost } from './lib/picture-in-picture';
import { StreamWindow } from './components/StreamWindow';
import { createShareAudio } from './lib/share-audio';
import { createVoiceLeveler, primeVoiceContext } from './lib/voice-leveler';
import { startRingtone, stopRingtone } from './lib/ringtone';
import { createBrowserTabOwnership } from './lib/tab-ownership';
import { acquireWakeLock, releaseWakeLock } from './lib/wake-lock';
import './styles/calls.css';

interface CallProviderProps {
  rooms: RoomSummary[];
}

const noopSubscribe = () => () => undefined;
const emptySnapshot = () => EMPTY_CALL_SNAPSHOT;

function isBlocked(room: RoomSummary): boolean {
  return room.userBlocked || room.isBlockedBy || room.isMutuallyBlocked;
}

export function CallProvider({ rooms, children }: PropsWithChildren<CallProviderProps>) {
  const { socket } = useSocket();
  const [controller, setController] = useState<CallController | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [streamVolume, setStreamVolume] = useState(1);
  const [sharePreviewHidden, setSharePreviewHidden] = useState(false);
  const [streamWindow, setStreamWindow] = useState<Window | null>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const voiceRef = useRef<HTMLAudioElement>(null);
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
      acquireMedia: (kind) => acquireLocalMedia(kind, { audioProcessing: getAudioProcessing(), audioInputId: preferredAudioRef.current, videoInputId: preferredVideoRef.current }),
      acquireCamera: () => acquireCameraTrack({ videoInputId: preferredVideoRef.current }),
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
  const localSpeaking = showSelfSpeaking(useSpeaking(snapshot.localStream, (phase === 'active' || phase === 'reconnecting') && !snapshot.muted), snapshot.muted);

  useEffect(() => {
    if (phase === 'idle' || phase === 'ended') {
      resetKnownDevices();
    }
  }, [phase]);

  useEffect(() => {
    if (phase === 'idle') {
      setMinimized(false);
    }
  }, [phase]);

  const preferredAudioRef = useRef<string | undefined>(undefined);
  const preferredVideoRef = useRef<string | undefined>(undefined);
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

  const replaceTrackFromDevice = useCallback(
    (constraints: MediaStreamConstraints, apply: (track: MediaStreamTrack) => Promise<void>) => {
      void navigator.mediaDevices
        .getUserMedia(constraints)
        .then((stream) => {
          const track = stream.getTracks()[0];
          return track ? apply(track) : undefined;
        })
        .catch(() => undefined);
    },
    [],
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
    localSpeaking,
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
      preferredAudioRef.current = deviceId || undefined;
      replaceTrackFromDevice({ audio: audioConstraints(deviceId || undefined, getAudioProcessing()) }, (track) => controller?.replaceAudioInput(track) ?? Promise.resolve());
    },
    changeVideoInput: (deviceId) => {
      preferredVideoRef.current = deviceId || undefined;
      if (snapshot.cameraOn) {
        replaceTrackFromDevice({ video: videoConstraints(isMobileDevice(), deviceId || undefined) }, (track) => controller?.replaceVideoInput(track) ?? Promise.resolve());
      }
    },
    changeAudioProcessing: (patch: Partial<AudioProcessing>) => {
      const next = setAudioProcessing(patch);
      replaceTrackFromDevice({ audio: audioConstraints(preferredAudioRef.current, next) }, (track) => controller?.replaceAudioInput(track) ?? Promise.resolve());
    },
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
      {children}
      <CallScreen videoRef={remoteRef} voiceRef={voiceRef} />
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
    </CallContext>
  );
}
