export const SW_SCRIPT_PATH = '/app/sw.js';
export const SW_SCOPE = '/app/';
export const OFFLINE_PAGE_PATH = 'offline.html';

export const LAUNCH_ROOM_PARAM = 'room';
export const LAUNCH_CALL_PARAM = 'call';
export const LAUNCH_ACTION_PARAM = 'action';
export const LAUNCH_INSTALL_PARAM = 'install';
export const LAUNCH_NEW_CHAT_ACTION = 'new-chat';

export const NOTIFICATION_ACTION_ANSWER = 'answer';
export const NOTIFICATION_ACTION_DECLINE = 'decline';

export type ClientToWorkerMessage =
  | { type: 'sparkchat:locale'; language: 'pt' | 'en' }
  | { type: 'sparkchat:active-room'; roomId: string | null };

export type WorkerToClientMessage =
  | { type: 'sparkchat:open-room'; roomId: string; callId?: string }
  | { type: 'sparkchat:call-decline'; callId: string }
  | { type: 'sparkchat:push-subscription-changed' };

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

export function isWorkerToClientMessage(value: unknown): value is WorkerToClientMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const message = value as Record<string, unknown>;
  switch (message.type) {
    case 'sparkchat:open-room':
      return isSafeId(message.roomId) && (message.callId === undefined || isSafeId(message.callId));
    case 'sparkchat:call-decline':
      return isSafeId(message.callId);
    case 'sparkchat:push-subscription-changed':
      return true;
    default:
      return false;
  }
}

export function isClientToWorkerMessage(value: unknown): value is ClientToWorkerMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const message = value as Record<string, unknown>;
  if (message.type === 'sparkchat:locale') {
    return message.language === 'pt' || message.language === 'en';
  }
  if (message.type === 'sparkchat:active-room') {
    return message.roomId === null || isSafeId(message.roomId);
  }
  return false;
}

export function buildLaunchUrl(scope: string, params: { roomId?: string; callId?: string } = {}): string {
  const url = new URL(scope);
  if (params.roomId) {
    url.searchParams.set(LAUNCH_ROOM_PARAM, params.roomId);
  }
  if (params.callId) {
    url.searchParams.set(LAUNCH_CALL_PARAM, params.callId);
  }
  return url.href;
}
