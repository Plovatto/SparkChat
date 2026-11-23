import type { CallKind, CallRole } from '@lib/e2ee/call-crypto';

export type { CallKind, CallRole };
export type CallPhase = 'idle' | 'outgoing-ringing' | 'incoming-ringing' | 'connecting' | 'active' | 'reconnecting' | 'ended';
export type CallEndReason =
  | 'completed'
  | 'missed'
  | 'declined'
  | 'cancelled'
  | 'busy'
  | 'failed'
  | 'connection-lost'
  | 'answered-elsewhere';

export const CALL_RING_BACKSTOP_MS = 50_000;
export const CALL_CONNECT_TIMEOUT_MS = 30_000;
export const CALL_RECONNECT_TIMEOUT_MS = 30_000;
export const CALL_ENDED_LINGER_MS = 4_000;

export interface CallState {
  phase: CallPhase;
  callId: string | null;
  roomId: string | null;
  peerId: string | null;
  kind: CallKind | null;
  role: CallRole | null;
  reason: CallEndReason | null;
  detail: string | null;
  connectedAt: number | null;
}

export type CallEvent =
  | { type: 'start'; callId: string; roomId: string; peerId: string; kind: CallKind }
  | { type: 'incoming'; callId: string; roomId: string; peerId: string; kind: CallKind }
  | { type: 'accept-local'; callId: string }
  | { type: 'decline-local'; callId: string }
  | { type: 'hangup-local'; callId: string }
  | { type: 'remote-accepted'; callId: string }
  | { type: 'remote-ended'; callId: string; reason: CallEndReason }
  | { type: 'answered-elsewhere'; callId: string }
  | { type: 'declined-elsewhere'; callId: string }
  | { type: 'accept-rejected'; callId: string }
  | { type: 'media'; callId: string; status: 'connected' | 'interrupted'; at?: number }
  | { type: 'failure'; callId: string; detail: string; reason?: CallEndReason }
  | { type: 'timeout'; callId: string; timer: CallTimer }
  | { type: 'transfer-in'; callId: string; roomId: string; peerId: string; kind: CallKind; role: CallRole; connectedAt: number | null }
  | { type: 'transferred-away'; callId: string }
  | { type: 'peer-transfer'; callId: string }
  | { type: 'dismiss' };

export type CallTimer = 'ring' | 'connect' | 'reconnect' | 'linger';

export type CallEffect =
  | { type: 'send-start'; callId: string }
  | { type: 'send-accept'; callId: string }
  | { type: 'send-decline'; callId: string }
  | { type: 'send-hangup'; callId: string }
  | { type: 'create-peer'; callId: string }
  | { type: 'close-peer'; callId: string }
  | { type: 'start-ringtone'; callId: string }
  | { type: 'stop-ringtone'; callId: string };

export interface Transition {
  state: CallState;
  effects: CallEffect[];
}

export const IDLE_CALL_STATE: CallState = {
  phase: 'idle',
  callId: null,
  roomId: null,
  peerId: null,
  kind: null,
  role: null,
  reason: null,
  detail: null,
  connectedAt: null,
};

const LIVE_PHASES: ReadonlySet<CallPhase> = new Set(['outgoing-ringing', 'incoming-ringing', 'connecting', 'active', 'reconnecting']);
const MEDIA_PHASES: ReadonlySet<CallPhase> = new Set(['connecting', 'active', 'reconnecting']);

export function isCallLive(state: CallState): boolean {
  return LIVE_PHASES.has(state.phase);
}

export function blocksNewCall(state: CallState, roomId: string | null): boolean {
  if (state.phase === 'idle' || state.phase === 'ended') {
    return false;
  }
  return !(state.phase === 'incoming-ringing' && roomId !== null && state.roomId === roomId);
}

export function hasCallMedia(state: CallState): boolean {
  return MEDIA_PHASES.has(state.phase);
}

function losesAcceptRace(state: CallState): boolean {
  return state.phase === 'incoming-ringing' || (state.role === 'callee' && state.phase === 'connecting');
}

function unchanged(state: CallState): Transition {
  return { state, effects: [] };
}

function finish(state: CallState, reason: CallEndReason, effects: CallEffect[], detail: string | null = null): Transition {
  const callId = state.callId;
  const cleanup: CallEffect[] = callId
    ? [
        ...(state.phase === 'incoming-ringing' ? [{ type: 'stop-ringtone', callId } as const] : []),
        ...(MEDIA_PHASES.has(state.phase) ? [{ type: 'close-peer', callId } as const] : []),
      ]
    : [];
  return { state: { ...state, phase: 'ended', reason, detail }, effects: [...effects, ...cleanup] };
}

export function transition(state: CallState, event: CallEvent): Transition {
  if (event.type === 'dismiss') {
    return state.phase === 'ended' ? { state: IDLE_CALL_STATE, effects: [] } : unchanged(state);
  }

  if (event.type === 'transfer-in') {
    if (state.phase !== 'idle' && state.phase !== 'ended') {
      return unchanged(state);
    }
    return {
      state: {
        ...IDLE_CALL_STATE,
        phase: 'reconnecting',
        callId: event.callId,
        roomId: event.roomId,
        peerId: event.peerId,
        kind: event.kind,
        role: event.role,
        connectedAt: event.connectedAt,
      },
      effects: [],
    };
  }

  if (event.type === 'start' || event.type === 'incoming') {
    if (state.phase !== 'idle' && state.phase !== 'ended') {
      return unchanged(state);
    }
    const outgoing = event.type === 'start';
    const next: CallState = {
      ...IDLE_CALL_STATE,
      phase: outgoing ? 'outgoing-ringing' : 'incoming-ringing',
      callId: event.callId,
      roomId: event.roomId,
      peerId: event.peerId,
      kind: event.kind,
      role: outgoing ? 'caller' : 'callee',
    };
    return { state: next, effects: [{ type: outgoing ? 'send-start' : 'start-ringtone', callId: event.callId }] };
  }

  if (!state.callId || state.callId !== event.callId) {
    return unchanged(state);
  }
  const callId = state.callId;

  switch (event.type) {
    case 'accept-local':
      if (state.phase !== 'incoming-ringing') {
        return unchanged(state);
      }
      return {
        state: { ...state, phase: 'connecting' },
        effects: [
          { type: 'stop-ringtone', callId },
          { type: 'send-accept', callId },
          { type: 'create-peer', callId },
        ],
      };

    case 'decline-local':
      if (state.phase !== 'incoming-ringing') {
        return unchanged(state);
      }
      return finish(state, 'declined', [{ type: 'send-decline', callId }]);

    case 'hangup-local':
      if (state.phase === 'incoming-ringing') {
        return finish(state, 'declined', [{ type: 'send-decline', callId }]);
      }
      if (state.phase === 'outgoing-ringing' || state.phase === 'connecting') {
        return finish(state, 'cancelled', [{ type: 'send-hangup', callId }]);
      }
      if (state.phase === 'active' || state.phase === 'reconnecting') {
        return finish(state, 'completed', [{ type: 'send-hangup', callId }]);
      }
      return unchanged(state);

    case 'remote-accepted':
      if (state.phase !== 'outgoing-ringing') {
        return unchanged(state);
      }
      return { state: { ...state, phase: 'connecting' }, effects: [{ type: 'create-peer', callId }] };

    case 'remote-ended':
      return isCallLive(state) ? finish(state, event.reason, []) : unchanged(state);

    case 'answered-elsewhere':
      return losesAcceptRace(state) ? finish(state, 'answered-elsewhere', []) : unchanged(state);

    case 'declined-elsewhere':
      return losesAcceptRace(state) ? finish(state, 'declined', []) : unchanged(state);

    case 'accept-rejected':
      return state.role === 'callee' && state.phase === 'connecting' ? finish(state, 'answered-elsewhere', []) : unchanged(state);

    case 'media':
      if (event.status === 'connected') {
        if (state.phase === 'connecting') {
          return { state: { ...state, phase: 'active', connectedAt: event.at ?? Date.now() }, effects: [] };
        }
        if (state.phase === 'reconnecting') {
          return { state: { ...state, phase: 'active', connectedAt: state.connectedAt ?? event.at ?? Date.now() }, effects: [] };
        }
        return unchanged(state);
      }
      return state.phase === 'active' ? { state: { ...state, phase: 'reconnecting' }, effects: [] } : unchanged(state);

    case 'failure':
      if (!isCallLive(state)) {
        return unchanged(state);
      }
      return finish(state, event.reason ?? 'failed', state.phase === 'incoming-ringing' ? [] : [{ type: 'send-hangup', callId }], event.detail);

    case 'timeout':
      return handleTimeout(state, event.timer, callId);

    case 'transferred-away':
      return hasCallMedia(state) ? { state: IDLE_CALL_STATE, effects: [] } : unchanged(state);

    case 'peer-transfer':
      return state.phase === 'active' || state.phase === 'connecting' ? { state: { ...state, phase: 'reconnecting' }, effects: [] } : unchanged(state);

    default:
      return unchanged(state);
  }
}

function handleTimeout(state: CallState, timer: CallTimer, callId: string): Transition {
  if (timer === 'linger') {
    return state.phase === 'ended' ? { state: IDLE_CALL_STATE, effects: [] } : unchanged(state);
  }
  if (timer === 'ring') {
    if (state.phase === 'outgoing-ringing') {
      return finish(state, 'missed', [{ type: 'send-hangup', callId }]);
    }
    return state.phase === 'incoming-ringing' ? finish(state, 'missed', []) : unchanged(state);
  }
  if (timer === 'connect') {
    return state.phase === 'connecting' ? finish(state, 'failed', [{ type: 'send-hangup', callId }], 'connect-timeout') : unchanged(state);
  }
  return state.phase === 'reconnecting' ? finish(state, 'connection-lost', [{ type: 'send-hangup', callId }]) : unchanged(state);
}

export function timerForPhase(phase: CallPhase): { timer: CallTimer; ms: number } | null {
  switch (phase) {
    case 'outgoing-ringing':
    case 'incoming-ringing':
      return { timer: 'ring', ms: CALL_RING_BACKSTOP_MS };
    case 'connecting':
      return { timer: 'connect', ms: CALL_CONNECT_TIMEOUT_MS };
    case 'reconnecting':
      return { timer: 'reconnect', ms: CALL_RECONNECT_TIMEOUT_MS };
    case 'ended':
      return { timer: 'linger', ms: CALL_ENDED_LINGER_MS };
    default:
      return null;
  }
}

export interface CallMachineOptions {
  onEffect: (effect: CallEffect, state: CallState) => void;
  onChange: (state: CallState) => void;
  extendReconnect?: (state: CallState) => boolean;
  extendConnect?: (state: CallState) => boolean;
}

export interface CallMachine {
  getState: () => CallState;
  dispatch: (event: CallEvent) => CallState;
  dispose: () => void;
}

export function createCallMachine(options: CallMachineOptions): CallMachine {
  let state = IDLE_CALL_STATE;
  let timerHandle: ReturnType<typeof setTimeout> | null = null;
  let timerKey = '';

  const clearTimer = () => {
    if (timerHandle !== null) {
      clearTimeout(timerHandle);
      timerHandle = null;
    }
    timerKey = '';
  };

  const syncTimer = () => {
    const wanted = timerForPhase(state.phase);
    const key = wanted ? `${state.callId ?? ''}:${state.phase}` : '';
    if (key === timerKey) {
      return;
    }
    clearTimer();
    if (!wanted || !state.callId) {
      return;
    }
    const callId = state.callId;
    timerKey = key;
    const arm = () => {
      timerHandle = setTimeout(() => {
        timerHandle = null;
        if (wanted.timer === 'reconnect' && timerKey === key && options.extendReconnect?.(state) === true) {
          arm();
          return;
        }
        if (wanted.timer === 'connect' && timerKey === key && options.extendConnect?.(state) === true) {
          arm();
          return;
        }
        timerKey = '';
        dispatch({ type: 'timeout', callId, timer: wanted.timer });
      }, wanted.ms);
    };
    arm();
  };

  const dispatch = (event: CallEvent): CallState => {
    const result = transition(state, event);
    const changed = result.state !== state;
    state = result.state;
    if (changed) {
      syncTimer();
      options.onChange(state);
    }
    for (const effect of result.effects) {
      options.onEffect(effect, state);
    }
    return state;
  };

  return {
    getState: () => state,
    dispatch,
    dispose: () => {
      clearTimer();
    },
  };
}
