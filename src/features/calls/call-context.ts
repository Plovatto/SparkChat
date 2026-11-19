import { createContext, use } from 'react';
import type { CallKind } from '@lib/e2ee/call-crypto';
import type { RoomSummary } from '@lib/socket';
import type { CallSnapshot } from './lib/call-controller';

export interface PeerDisplay {
  id: string;
  name: string;
  avatar: number;
}

export interface CallApi {
  snapshot: CallSnapshot;
  minimized: boolean;
  setMinimized: (value: boolean) => void;
  canCall: (room: RoomSummary) => boolean;
  startCall: (room: RoomSummary, kind: CallKind) => void;
  startCallInRoom: (roomId: string, kind: CallKind) => void;
  accept: () => void;
  decline: () => void;
  silence: () => void;
  hangup: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  dismissNotice: () => void;
  dismissEnded: () => void;
  changeAudioInput: (deviceId: string) => void;
  changeVideoInput: (deviceId: string) => void;
  primePlayback: () => void;
  peerDisplay: (peerId: string | null) => PeerDisplay | null;
}

export const CallContext = createContext<CallApi | null>(null);

export function useOptionalCall(): CallApi | null {
  return use(CallContext);
}

export function useCall(): CallApi {
  const api = use(CallContext);
  if (!api) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return api;
}
