import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { isAssistantRoom } from '@features/chat/utils/assistant';
import { getCurrentIdentity } from '@lib/e2ee';
import type { CallKind } from '@lib/e2ee/call-crypto';
import { useSocket, type RoomSummary } from '@lib/socket';
import { CallContext, type CallApi, type PeerDisplay } from './call-context';
import { CallMiniBar } from './components/CallMiniBar';
import { CallNotices } from './components/CallNotices';
import { CallScreen } from './components/CallScreen';
import { IncomingCallModal } from './components/IncomingCallModal';
import { CallController, EMPTY_CALL_SNAPSHOT, type CallSocket } from './lib/call-controller';
import { resolvePinnedPeer } from './lib/call-peer';
import { getProtectIp } from './lib/call-settings';
import { acquireCameraTrack, acquireLocalMedia, audioConstraints, isMobileDevice, stopStream, videoConstraints } from './lib/media-devices';
import { PeerSession } from './lib/peer-session';
import { startRingtone, stopRingtone } from './lib/ringtone';
import { createBrowserTabOwnership } from './lib/tab-ownership';
import { acquireWakeLock, releaseWakeLock } from './lib/wake-lock';

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
  const remoteRef = useRef<HTMLVideoElement>(null);
  const roomsRef = useRef(rooms);
  roomsRef.current = rooms;

  useEffect(() => {
    if (!socket) {
      return;
    }
    const tabs = createBrowserTabOwnership();
    const instance = new CallController({
      socket: socket as unknown as CallSocket,
      getIdentity: getCurrentIdentity,
      resolvePeer: (userId) => resolvePinnedPeer(socket, userId),
      tabs,
      acquireMedia: (kind) => acquireLocalMedia(kind),
      acquireCamera: () => acquireCameraTrack(),
      stopMedia: stopStream,
      createPeerSession: (options) => new PeerSession(options),
      getProtectIp,
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

  const snapshot = useSyncExternalStore(controller ? controller.subscribe : noopSubscribe, controller ? controller.getSnapshot : emptySnapshot);
  const phase = snapshot.state.phase;

  useEffect(() => {
    if (phase === 'idle') {
      setMinimized(false);
    }
  }, [phase]);

  const primePlayback = useCallback(() => {
    void remoteRef.current?.play().catch(() => undefined);
  }, []);

  const startCallInRoom = useCallback(
    (roomId: string, kind: CallKind) => {
      const room = roomsRef.current.find((candidate) => candidate.id === roomId);
      const identity = getCurrentIdentity();
      const peerId = room?.participants.find((participant) => participant.id !== identity?.userId)?.id;
      if (!controller || !room || !peerId || room.type !== 'private' || isAssistantRoom(room) || isBlocked(room)) {
        return;
      }
      primePlayback();
      setMinimized(false);
      void controller.startCall({ roomId, peerId, kind });
    },
    [controller, primePlayback],
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

  const api: CallApi = {
    snapshot,
    minimized,
    setMinimized,
    canCall: (room) => snapshot.enabled && room.type === 'private' && !isAssistantRoom(room) && !isBlocked(room),
    startCall: (room, kind) => startCallInRoom(room.id, kind),
    startCallInRoom,
    accept: () => {
      primePlayback();
      setMinimized(false);
      void controller?.accept();
    },
    decline: () => controller?.decline(),
    silence: () => controller?.silence(),
    hangup: () => controller?.hangup(),
    toggleMute: () => controller?.toggleMute(),
    toggleCamera: () => void controller?.toggleCamera(),
    dismissNotice: () => controller?.dismissNotice(),
    dismissEnded: () => controller?.dismissEnded(),
    changeAudioInput: (deviceId) =>
      replaceTrackFromDevice({ audio: audioConstraints(deviceId) }, (track) => controller?.replaceAudioInput(track) ?? Promise.resolve()),
    changeVideoInput: (deviceId) =>
      replaceTrackFromDevice({ video: videoConstraints(isMobileDevice(), deviceId) }, (track) => controller?.replaceVideoInput(track) ?? Promise.resolve()),
    primePlayback,
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
      <CallScreen videoRef={remoteRef} />
      <CallMiniBar />
      <IncomingCallModal />
      <CallNotices />
    </CallContext>
  );
}
