import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CALL_CONNECT_TIMEOUT_MS,
  CALL_ENDED_LINGER_MS,
  CALL_RECONNECT_TIMEOUT_MS,
  CALL_RING_BACKSTOP_MS,
  IDLE_CALL_STATE,
  createCallMachine,
  hasCallMedia,
  transition,
  type CallEffect,
  type CallEvent,
  type CallState,
} from './call-machine';

const A = 'call-a';
const B = 'call-b';

const outgoing: CallEvent = { type: 'start', callId: A, roomId: 'room', peerId: 'peer', kind: 'voice' };
const incoming: CallEvent = { type: 'incoming', callId: A, roomId: 'room', peerId: 'peer', kind: 'video' };

function run(events: CallEvent[], from: CallState = IDLE_CALL_STATE): { state: CallState; effects: CallEffect[] } {
  let state = from;
  const effects: CallEffect[] = [];
  for (const event of events) {
    const result = transition(state, event);
    state = result.state;
    effects.push(...result.effects);
  }
  return { state, effects };
}

function effectTypes(effects: CallEffect[]): string[] {
  return effects.map((effect) => effect.type);
}

describe('transition table', () => {
  it('starts an outgoing call from idle', () => {
    const { state, effects } = run([outgoing]);

    expect(state).toMatchObject({ phase: 'outgoing-ringing', callId: A, role: 'caller', kind: 'voice', peerId: 'peer' });
    expect(effects).toEqual([{ type: 'send-start', callId: A }]);
  });

  it('rings on an incoming call and starts the ringtone', () => {
    const { state, effects } = run([incoming]);

    expect(state).toMatchObject({ phase: 'incoming-ringing', role: 'callee', kind: 'video' });
    expect(effects).toEqual([{ type: 'start-ringtone', callId: A }]);
  });

  it('creates the peer only after the caller sees the accept', () => {
    const ringing = run([outgoing]);
    expect(effectTypes(ringing.effects)).not.toContain('create-peer');

    const accepted = run([{ type: 'remote-accepted', callId: A }], ringing.state);
    expect(accepted.state.phase).toBe('connecting');
    expect(accepted.effects).toEqual([{ type: 'create-peer', callId: A }]);
  });

  it('answers as callee: stops the ringtone, sends accept, then creates the peer', () => {
    const { state, effects } = run([incoming, { type: 'accept-local', callId: A }]);

    expect(state.phase).toBe('connecting');
    expect(effectTypes(effects)).toEqual(['start-ringtone', 'stop-ringtone', 'send-accept', 'create-peer']);
  });

  it('declines an incoming call for everyone', () => {
    const { state, effects } = run([incoming, { type: 'decline-local', callId: A }]);

    expect(state).toMatchObject({ phase: 'ended', reason: 'declined' });
    expect(effectTypes(effects)).toEqual(['start-ringtone', 'send-decline', 'stop-ringtone']);
  });

  it('treats a local hangup while ringing as decline for the callee and cancel for the caller', () => {
    expect(run([incoming, { type: 'hangup-local', callId: A }]).state.reason).toBe('declined');
    const caller = run([outgoing, { type: 'hangup-local', callId: A }]);
    expect(caller.state).toMatchObject({ phase: 'ended', reason: 'cancelled' });
    expect(effectTypes(caller.effects)).toEqual(['send-start', 'send-hangup']);
  });

  it('goes connecting to active to reconnecting and back', () => {
    const base = run([outgoing, { type: 'remote-accepted', callId: A }]);
    const active = run([{ type: 'media', callId: A, status: 'connected', at: 1000 }], base.state);
    expect(active.state).toMatchObject({ phase: 'active', connectedAt: 1000 });

    const reconnecting = run([{ type: 'media', callId: A, status: 'interrupted' }], active.state);
    expect(reconnecting.state.phase).toBe('reconnecting');

    const back = run([{ type: 'media', callId: A, status: 'connected', at: 5000 }], reconnecting.state);
    expect(back.state).toMatchObject({ phase: 'active', connectedAt: 1000 });
  });

  it('ignores an interruption while still connecting', () => {
    const base = run([outgoing, { type: 'remote-accepted', callId: A }, { type: 'media', callId: A, status: 'interrupted' }]);

    expect(base.state.phase).toBe('connecting');
  });

  it('hangs up an active call as completed and closes the peer', () => {
    const base = run([outgoing, { type: 'remote-accepted', callId: A }, { type: 'media', callId: A, status: 'connected' }]);
    const { state, effects } = run([{ type: 'hangup-local', callId: A }], base.state);

    expect(state).toMatchObject({ phase: 'ended', reason: 'completed' });
    expect(effectTypes(effects)).toEqual(['send-hangup', 'close-peer']);
  });

  it('closes the peer when the server ends the call', () => {
    const base = run([outgoing, { type: 'remote-accepted', callId: A }]);
    const { state, effects } = run([{ type: 'remote-ended', callId: A, reason: 'connection-lost' }], base.state);

    expect(state).toMatchObject({ phase: 'ended', reason: 'connection-lost' });
    expect(effects).toEqual([{ type: 'close-peer', callId: A }]);
  });

  it('ends an unanswered incoming call when answered or declined on another device', () => {
    expect(run([incoming, { type: 'answered-elsewhere', callId: A }]).state).toMatchObject({ phase: 'ended', reason: 'answered-elsewhere' });
    expect(run([incoming, { type: 'declined-elsewhere', callId: A }]).state).toMatchObject({ phase: 'ended', reason: 'declined' });
  });

  it('ends the losing callee without hanging up when answered or declined elsewhere while connecting', () => {
    const base = run([incoming, { type: 'accept-local', callId: A }]);

    for (const event of [{ type: 'answered-elsewhere', callId: A }, { type: 'declined-elsewhere', callId: A }, { type: 'accept-rejected', callId: A }] as const) {
      const result = run([event], base.state);
      expect(result.state.phase).toBe('ended');
      expect(effectTypes(result.effects)).toEqual(['close-peer']);
    }
  });

  it('does not let answered-elsewhere end an active call or a call this device started', () => {
    const active = run([incoming, { type: 'accept-local', callId: A }, { type: 'media', callId: A, status: 'connected' }]);
    const caller = run([outgoing, { type: 'remote-accepted', callId: A }]);

    expect(run([{ type: 'answered-elsewhere', callId: A }], active.state).state.phase).toBe('active');
    expect(run([{ type: 'accept-rejected', callId: A }], caller.state).state).toBe(caller.state);
  });

  it('ends with the failure detail and hangs up', () => {
    const base = run([outgoing, { type: 'remote-accepted', callId: A }]);
    const { state, effects } = run([{ type: 'failure', callId: A, detail: 'fingerprint-mismatch' }], base.state);

    expect(state).toMatchObject({ phase: 'ended', reason: 'failed', detail: 'fingerprint-mismatch' });
    expect(effectTypes(effects)).toEqual(['send-hangup', 'close-peer']);
  });

  it('allows a new call after the previous one ended, and returns to idle on dismiss', () => {
    const ended = run([outgoing, { type: 'remote-ended', callId: A, reason: 'declined' }]);

    expect(run([{ ...outgoing, callId: B }], ended.state).state).toMatchObject({ phase: 'outgoing-ringing', callId: B });
    expect(run([{ type: 'dismiss' }], ended.state).state).toEqual(IDLE_CALL_STATE);
    expect(run([{ type: 'dismiss' }], run([outgoing]).state).state.phase).toBe('outgoing-ringing');
  });

  it('ignores every event for a different call id', () => {
    const base = run([outgoing, { type: 'remote-accepted', callId: A }]);
    const events: CallEvent[] = [
      { type: 'hangup-local', callId: B },
      { type: 'remote-ended', callId: B, reason: 'failed' },
      { type: 'media', callId: B, status: 'connected' },
      { type: 'failure', callId: B, detail: 'x' },
      { type: 'accept-local', callId: B },
    ];

    for (const event of events) {
      expect(run([event], base.state).state).toBe(base.state);
    }
  });

  it('does not allow a second call while one is live', () => {
    const base = run([outgoing]);

    expect(run([{ ...incoming, callId: B }], base.state).state).toBe(base.state);
    expect(run([{ ...outgoing, callId: B }], base.state).state).toBe(base.state);
  });

  it('handles duplicates idempotently', () => {
    const accepted = run([incoming, { type: 'accept-local', callId: A }]);
    const again = run([{ type: 'accept-local', callId: A }, { type: 'decline-local', callId: A }], accepted.state);

    expect(again.state).toBe(accepted.state);
    expect(again.effects).toEqual([]);

    const ended = run([outgoing, { type: 'hangup-local', callId: A }]);
    expect(run([{ type: 'hangup-local', callId: A }, { type: 'remote-ended', callId: A, reason: 'failed' }], ended.state).state).toBe(ended.state);
  });
});

describe('createCallMachine timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function create() {
    const effects: CallEffect[] = [];
    const changes: CallState[] = [];
    const machine = createCallMachine({
      onEffect: (effect) => effects.push(effect),
      onChange: (state) => changes.push(state),
    });
    return { machine, effects, changes };
  }

  it('marks an unanswered outgoing call as missed after the backstop and hangs up', () => {
    const { machine, effects } = create();
    machine.dispatch(outgoing);

    vi.advanceTimersByTime(CALL_RING_BACKSTOP_MS - 1);
    expect(machine.getState().phase).toBe('outgoing-ringing');
    vi.advanceTimersByTime(1);

    expect(machine.getState()).toMatchObject({ phase: 'ended', reason: 'missed' });
    expect(effects.map((effect) => effect.type)).toEqual(['send-start', 'send-hangup']);
  });

  it('cancels the ring timer when the call is answered', () => {
    const { machine } = create();
    machine.dispatch(outgoing);
    machine.dispatch({ type: 'remote-accepted', callId: A });

    vi.advanceTimersByTime(CALL_CONNECT_TIMEOUT_MS - 1);

    expect(machine.getState().phase).toBe('connecting');
  });

  it('fails a call that never connects', () => {
    const { machine, effects } = create();
    machine.dispatch(outgoing);
    machine.dispatch({ type: 'remote-accepted', callId: A });

    vi.advanceTimersByTime(CALL_CONNECT_TIMEOUT_MS);

    expect(machine.getState()).toMatchObject({ phase: 'ended', reason: 'failed', detail: 'connect-timeout' });
    expect(effects.map((effect) => effect.type)).toEqual(['send-start', 'create-peer', 'send-hangup', 'close-peer']);
  });

  it('ends with connection-lost when reconnecting takes too long and recovers when media returns', () => {
    const { machine } = create();
    machine.dispatch(outgoing);
    machine.dispatch({ type: 'remote-accepted', callId: A });
    machine.dispatch({ type: 'media', callId: A, status: 'connected' });
    machine.dispatch({ type: 'media', callId: A, status: 'interrupted' });

    vi.advanceTimersByTime(CALL_RECONNECT_TIMEOUT_MS - 1);
    machine.dispatch({ type: 'media', callId: A, status: 'connected' });
    vi.advanceTimersByTime(CALL_RECONNECT_TIMEOUT_MS * 2);
    expect(machine.getState().phase).toBe('active');

    machine.dispatch({ type: 'media', callId: A, status: 'interrupted' });
    vi.advanceTimersByTime(CALL_RECONNECT_TIMEOUT_MS);
    expect(machine.getState()).toMatchObject({ phase: 'ended', reason: 'connection-lost' });
  });

  it('keeps reconnecting while the controller asks to extend and ends once it stops asking', () => {
    const effects: CallEffect[] = [];
    let extend = true;
    const asked: string[] = [];
    const machine = createCallMachine({
      onEffect: (effect) => effects.push(effect),
      onChange: () => undefined,
      extendReconnect: (state) => {
        asked.push(state.phase);
        return extend;
      },
    });
    machine.dispatch(outgoing);
    machine.dispatch({ type: 'remote-accepted', callId: A });
    machine.dispatch({ type: 'media', callId: A, status: 'connected' });
    machine.dispatch({ type: 'media', callId: A, status: 'interrupted' });

    vi.advanceTimersByTime(CALL_RECONNECT_TIMEOUT_MS * 5);
    expect(machine.getState().phase).toBe('reconnecting');
    expect(asked).toEqual(['reconnecting', 'reconnecting', 'reconnecting', 'reconnecting', 'reconnecting']);
    expect(effects.map((effect) => effect.type)).not.toContain('send-hangup');

    extend = false;
    vi.advanceTimersByTime(CALL_RECONNECT_TIMEOUT_MS);
    expect(machine.getState()).toMatchObject({ phase: 'ended', reason: 'connection-lost' });
    expect(effects.map((effect) => effect.type)).toContain('send-hangup');
  });

  it('only consults the extension for the reconnect timer', () => {
    const extendReconnect = vi.fn(() => true);
    const machine = createCallMachine({ onEffect: () => undefined, onChange: () => undefined, extendReconnect });
    machine.dispatch(outgoing);
    machine.dispatch({ type: 'remote-accepted', callId: A });

    vi.advanceTimersByTime(CALL_CONNECT_TIMEOUT_MS);

    expect(machine.getState()).toMatchObject({ phase: 'ended', reason: 'failed' });
    expect(extendReconnect).not.toHaveBeenCalled();
  });

  it('returns to idle after the linger period', () => {
    const { machine, changes } = create();
    machine.dispatch(incoming);
    machine.dispatch({ type: 'decline-local', callId: A });

    vi.advanceTimersByTime(CALL_ENDED_LINGER_MS);

    expect(machine.getState()).toEqual(IDLE_CALL_STATE);
    expect(changes.at(-1)).toEqual(IDLE_CALL_STATE);
  });

  it('stops timers on dispose', () => {
    const { machine } = create();
    machine.dispatch(outgoing);
    machine.dispose();

    vi.advanceTimersByTime(CALL_RING_BACKSTOP_MS * 2);

    expect(machine.getState().phase).toBe('outgoing-ringing');
  });
});

const callIds = fc.constantFrom(A, B, 'call-c');
const eventArbitrary: fc.Arbitrary<CallEvent> = fc.oneof(
  fc.record({ type: fc.constant('start' as const), callId: callIds, roomId: fc.constant('room'), peerId: fc.constant('peer'), kind: fc.constantFrom('voice' as const, 'video' as const) }),
  fc.record({ type: fc.constant('incoming' as const), callId: callIds, roomId: fc.constant('room'), peerId: fc.constant('peer'), kind: fc.constantFrom('voice' as const, 'video' as const) }),
  fc.record({ type: fc.constant('accept-local' as const), callId: callIds }),
  fc.record({ type: fc.constant('decline-local' as const), callId: callIds }),
  fc.record({ type: fc.constant('hangup-local' as const), callId: callIds }),
  fc.record({ type: fc.constant('remote-accepted' as const), callId: callIds }),
  fc.record({ type: fc.constant('remote-ended' as const), callId: callIds, reason: fc.constantFrom('completed' as const, 'missed' as const, 'failed' as const, 'busy' as const) }),
  fc.record({ type: fc.constant('answered-elsewhere' as const), callId: callIds }),
  fc.record({ type: fc.constant('accept-rejected' as const), callId: callIds }),
  fc.record({ type: fc.constant('declined-elsewhere' as const), callId: callIds }),
  fc.record({ type: fc.constant('media' as const), callId: callIds, status: fc.constantFrom('connected' as const, 'interrupted' as const) }),
  fc.record({ type: fc.constant('failure' as const), callId: callIds, detail: fc.constant('x') }),
  fc.record({ type: fc.constant('timeout' as const), callId: callIds, timer: fc.constantFrom('ring' as const, 'connect' as const, 'reconnect' as const, 'linger' as const) }),
  fc.constant({ type: 'dismiss' as const }),
);

describe('call machine properties', () => {
  it('keeps the invariants under any event order', () => {
    fc.assert(
      fc.property(fc.array(eventArbitrary, { maxLength: 60 }), (events) => {
        let state = IDLE_CALL_STATE;
        let peerCallId: string | null = null;
        const accepted = new Set<string>();

        for (const event of events) {
          const before = state;
          const result = transition(state, event);
          state = result.state;

          for (const effect of result.effects) {
            if (effect.type === 'create-peer') {
              expect(peerCallId).toBeNull();
              expect(['outgoing-ringing', 'incoming-ringing']).toContain(before.phase);
              expect(state.callId).toBe(effect.callId);
              peerCallId = effect.callId;
            }
            if (effect.type === 'close-peer') {
              expect(peerCallId).toBe(effect.callId);
              peerCallId = null;
            }
            if (effect.type === 'send-accept') {
              expect(accepted.has(effect.callId)).toBe(false);
              accepted.add(effect.callId);
              expect(before.phase).toBe('incoming-ringing');
            }
            if (effect.type === 'send-start') {
              expect(['idle', 'ended']).toContain(before.phase);
            }
          }

          expect(hasCallMedia(state)).toBe(peerCallId !== null);
          expect(state.callId === null).toBe(state.phase === 'idle');
          expect(state.phase === 'ended' ? state.reason !== null : state.reason === null).toBe(true);
          if (hasCallMedia(state)) {
            expect(peerCallId).toBe(state.callId);
          }
          if (before.callId && event.type !== 'start' && event.type !== 'incoming' && event.type !== 'dismiss' && 'callId' in event && event.callId !== before.callId) {
            expect(state).toBe(before);
          }
        }
      }),
      { numRuns: 400 },
    );
  });

  it('never has two live calls: a start or incoming while live changes nothing', () => {
    fc.assert(
      fc.property(fc.array(eventArbitrary, { maxLength: 40 }), callIds, (events, otherId) => {
        const { state } = run(events);
        if (state.phase === 'idle' || state.phase === 'ended') {
          return;
        }
        const result = transition(state, { ...outgoing, callId: otherId });
        expect(result.state).toBe(state);
        expect(result.effects).toEqual([]);
      }),
    );
  });

  it('never reaches media phases without an accept', () => {
    fc.assert(
      fc.property(fc.array(eventArbitrary, { maxLength: 40 }), (events) => {
        let state = IDLE_CALL_STATE;
        let sawAccept = false;
        for (const event of events) {
          if (
            (event.type === 'remote-accepted' && state.phase === 'outgoing-ringing' && event.callId === state.callId) ||
            (event.type === 'accept-local' && state.phase === 'incoming-ringing' && event.callId === state.callId)
          ) {
            sawAccept = true;
          }
          const next = transition(state, event).state;
          if (next.callId !== state.callId && next.callId !== null) {
            sawAccept = false;
          }
          state = next;
          if (hasCallMedia(state)) {
            expect(sawAccept).toBe(true);
          }
        }
      }),
    );
  });
});
