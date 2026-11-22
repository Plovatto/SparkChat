import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CallContext, type CallApi } from '@features/calls/call-context';
import { EMPTY_CALL_SNAPSHOT, type CallSnapshot } from '@features/calls/lib/call-controller';
import { appI18n } from '@lib/i18n/app-i18n';
import type { MessageView, RoomSummary } from '@lib/socket';
import { CallEventBubble } from './CallEventBubble';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock(import('@lib/e2ee/current-identity'), async (importOriginal) => ({
  ...(await importOriginal()),
  getCurrentIdentity: () => ({ userId: 'me', publicKey: '', privateKey: new Uint8Array() }),
}));

beforeEach(async () => {
  await appI18n.changeLanguage('pt');
});

function callMessage(type: string, params: Record<string, string | number | null>): MessageView {
  return {
    id: 'm1',
    roomId: 'room-1',
    sender: { id: 'system', nickname: 'system', avatar: 0 },
    content: '',
    type: 'system',
    duration: null,
    timestamp: '2026-11-20T01:12:00.000Z',
    deletedForEveryone: false,
    status: 'sent',
    deliveredTo: [],
    readBy: [],
    playedBy: [],
    replyTo: null,
    mentionedUserIds: [],
    fileMeta: null,
    caption: null,
    linkPreview: null,
    systemEvent: { type, params },
  } as unknown as MessageView;
}

const room = { id: 'room-1', type: 'private' } as unknown as RoomSummary;

function makeCall(patch: Partial<CallSnapshot> = {}, canCall = true) {
  return {
    snapshot: { ...EMPTY_CALL_SNAPSHOT, enabled: true, ...patch },
    canCall: vi.fn(() => canCall),
    startCall: vi.fn(),
    startCallInRoom: vi.fn(),
  } as unknown as CallApi & { canCall: ReturnType<typeof vi.fn>; startCall: ReturnType<typeof vi.fn>; startCallInRoom: ReturnType<typeof vi.fn> };
}

function renderBubble(message: MessageView, call: CallApi | null, withRoom: RoomSummary | null = room) {
  return render(
    <CallContext value={call}>
      <CallEventBubble message={message} entrancePhase="none" room={withRoom} />
    </CallContext>,
  );
}

describe('CallEventBubble', () => {
  it('shows a missed incoming voice call in red with a single pulse and a call back button', () => {
    const call = makeCall();
    const view = renderBubble(callMessage('call.missed', { kind: 'voice', callerId: 'peer', reason: 'missed' }), call);
    const card = view.container.querySelector('.sc-call-card');
    expect(card?.getAttribute('data-tone')).toBe('danger');
    expect(card?.getAttribute('data-own')).toBe('false');
    expect(view.container.querySelector('.sc-call-card__halo')?.getAttribute('data-pulse')).toBe('true');
    expect(screen.getByText('Chamada de voz')).toBeTruthy();
    expect(screen.getByText('Ligou para você')).toBeTruthy();
    expect(screen.getByText('Perdida')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'calls.callBack' }));
    expect(call.startCall).toHaveBeenCalledWith(room, 'voice');
  });

  it('shows the duration of an answered call in green without pulsing', () => {
    const view = renderBubble(callMessage('call.ended', { kind: 'voice', callerId: 'peer', reason: 'completed', durationSec: 1183 }), makeCall());
    const card = view.container.querySelector('.sc-call-card');
    expect(card?.getAttribute('data-tone')).toBe('success');
    expect(card?.getAttribute('data-status')).toBe('answered');
    expect(screen.getByText('19:43')).toBeTruthy();
    expect(view.container.querySelector('.sc-call-card__dot')).not.toBeNull();
    expect(view.container.querySelector('.sc-call-card__halo')?.getAttribute('data-pulse')).toBe('false');
  });

  it('aligns my own video call to the end and calls back with video', () => {
    const call = makeCall();
    const view = renderBubble(callMessage('call.ended', { kind: 'video', callerId: 'me', reason: 'completed', durationSec: 20 }), call);
    expect(view.container.querySelector('.sc-call-card-row')?.getAttribute('data-own')).toBe('true');
    expect(screen.getByText('Você ligou')).toBeTruthy();
    expect(screen.getByText('0:20')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'calls.callBack' }));
    expect(call.startCall).toHaveBeenCalledWith(room, 'video');
  });

  it('labels a declined incoming call as declined', () => {
    const view = renderBubble(callMessage('call.missed', { kind: 'video', callerId: 'peer', reason: 'declined' }), makeCall());
    expect(view.container.querySelector('.sc-call-card')?.getAttribute('data-status')).toBe('declined');
    expect(screen.getByText('Recusada')).toBeTruthy();
    expect(screen.getByText('Chamada de vídeo')).toBeTruthy();
  });

  it('hides the button when the room cannot place calls or there is no call api', () => {
    renderBubble(callMessage('call.missed', { kind: 'voice', callerId: 'peer', reason: 'missed' }), makeCall({}, false));
    expect(screen.queryByRole('button')).toBeNull();
    renderBubble(callMessage('call.missed', { kind: 'voice', callerId: 'peer', reason: 'missed' }), null);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('disables the button while another call is in progress', () => {
    const call = makeCall({ state: { ...EMPTY_CALL_SNAPSHOT.state, phase: 'active' } });
    renderBubble(callMessage('call.missed', { kind: 'voice', callerId: 'peer', reason: 'missed' }), call);
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'calls.callBack' });
    expect(button.disabled).toBe(true);
    expect(button.title).toBe('calls.alreadyInCall');
    fireEvent.click(button);
    expect(call.startCall).not.toHaveBeenCalled();
  });

  it('falls back to the room id when no room is provided', () => {
    const call = makeCall();
    renderBubble(callMessage('call.missed', { kind: 'video', callerId: 'peer', reason: 'missed' }), call, null);
    fireEvent.click(screen.getByRole('button', { name: 'calls.callBack' }));
    expect(call.startCallInRoom).toHaveBeenCalledWith('room-1', 'video');
  });

  it('hides the fallback button when calls are disabled', () => {
    renderBubble(callMessage('call.missed', { kind: 'voice', callerId: 'peer', reason: 'missed' }), makeCall({ enabled: false }), null);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
