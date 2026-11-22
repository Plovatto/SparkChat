import {
  isSafeId,
  LAUNCH_ACTION_PARAM,
  LAUNCH_CALL_PARAM,
  LAUNCH_INSTALL_PARAM,
  LAUNCH_NEW_CHAT_ACTION,
  LAUNCH_ROOM_PARAM,
} from '../sw/protocol';

export interface LaunchIntent {
  roomId: string | null;
  newChat: boolean;
  install: boolean;
  answerCallId: string | null;
}

const LAUNCH_PARAMS = [LAUNCH_ROOM_PARAM, LAUNCH_CALL_PARAM, LAUNCH_ACTION_PARAM, LAUNCH_INSTALL_PARAM];

export function readLaunchIntent(search: string): LaunchIntent {
  const params = new URLSearchParams(search);
  const roomId = params.get(LAUNCH_ROOM_PARAM);
  const callId = params.get(LAUNCH_CALL_PARAM);
  return {
    roomId: isSafeId(roomId) ? roomId : null,
    answerCallId: isSafeId(callId) ? callId : null,
    newChat: params.get(LAUNCH_ACTION_PARAM) === LAUNCH_NEW_CHAT_ACTION,
    install: params.get(LAUNCH_INSTALL_PARAM) === '1',
  };
}

export function stripLaunchParams(href: string): string | null {
  const url = new URL(href);
  if (!LAUNCH_PARAMS.some((name) => url.searchParams.has(name))) {
    return null;
  }
  LAUNCH_PARAMS.forEach((name) => url.searchParams.delete(name));
  return `${url.pathname}${url.search}${url.hash}`;
}

let pending: LaunchIntent = { roomId: null, newChat: false, install: false, answerCallId: null };

export function captureLaunchIntent(): LaunchIntent {
  if (typeof window === 'undefined') {
    return pending;
  }
  pending = readLaunchIntent(window.location.search);
  const cleaned = stripLaunchParams(window.location.href);
  if (cleaned !== null) {
    window.history.replaceState(window.history.state, '', cleaned);
  }
  return pending;
}

export function takePendingLaunch(): { roomId: string | null; newChat: boolean } {
  const { roomId, newChat } = pending;
  pending = { ...pending, roomId: null, newChat: false };
  return { roomId, newChat };
}

export function takePendingAnswer(): string | null {
  const { answerCallId } = pending;
  pending = { ...pending, answerCallId: null };
  return answerCallId;
}
