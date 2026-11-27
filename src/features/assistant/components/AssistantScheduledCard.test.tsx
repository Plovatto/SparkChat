import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AppI18n from '@lib/i18n/app-i18n';
import type { AssistantButton, AssistantCard } from '@lib/assistant/assistant-card';
import type { ChatMessage } from '@features/chat/types';
import { useAssistantCardActions } from '@features/chat/hooks/useAssistantCardActions';
import { AssistantCardView } from './AssistantCardView';

const sendTextToRoom = vi.hoisted(() => vi.fn());

vi.mock('@features/chat/utils/forward-message', () => ({ sendTextToRoom }));
vi.mock('@lib/i18n/app-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof AppI18n>()),
  translate: (key: string) => key,
  hasTranslation: () => false,
}));
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string, options?: { recipient?: string }) => (options?.recipient ? `${key}|${options.recipient}` : key) }),
}));

const yes: AssistantButton = { choice: 'yes', label: 'Sim' };
const no: AssistantButton = { choice: 'no', label: 'Não' };
const sendNowButton: AssistantButton = { choice: 'send-now', label: 'Enviar agora' };

const confirmCard: AssistantCard = {
  v: 1,
  kind: 'confirm',
  action: { type: 'scheduled-message', roomId: 'room-9', recipient: 'Ana', text: 'oi', sendAtLocal: '2026-11-27T09:00', timeZone: 'America/Sao_Paulo', sendAt: Date.UTC(2026, 10, 27, 12, 0) },
  buttons: [yes, no],
};

const failedCard: AssistantCard = {
  v: 1,
  kind: 'scheduled-failed',
  roomId: 'room-9',
  text: 'oi',
  buttons: [sendNowButton],
};

function cardMessage(id: string, card: AssistantCard): ChatMessage {
  return { id, roomId: 'room-1', card } as unknown as ChatMessage;
}

function createSocket() {
  const handlers = new Map<string, Set<(payload: never) => void>>();
  const socket = {
    on: vi.fn((event: string, handler: (payload: never) => void) => {
      const bucket = handlers.get(event) ?? new Set();
      bucket.add(handler);
      handlers.set(event, bucket);
    }),
    off: vi.fn((event: string, handler: (payload: never) => void) => {
      handlers.get(event)?.delete(handler);
    }),
    emit: vi.fn(),
  };
  const receive = (event: string, payload: unknown) => {
    for (const handler of Array.from(handlers.get(event) ?? [])) {
      handler(payload as never);
    }
  };
  return { socket, receive };
}

function setup(message: ChatMessage) {
  const { socket, receive } = createSocket();
  const onQuickReply = vi.fn();
  const hook = renderHook(() => useAssistantCardActions({ socket: socket as never, messages: [message], onQuickReply }));
  return { socket, receive, onQuickReply, hook };
}

describe('scheduled message card', () => {
  beforeEach(() => {
    sendTextToRoom.mockReset();
  });

  it('renders the summary with the recipient and locks the buttons while pending', () => {
    render(<AssistantCardView card={confirmCard} cardId="c1" onQuickReply={vi.fn()} />);
    expect(screen.getByText(/chat\.assistant\.card\.confirmScheduled\|Ana/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sim' }));
    expect(screen.getByRole('button', { name: 'Não' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows the error and re-enables the buttons after a failure', () => {
    const { rerender } = render(<AssistantCardView card={confirmCard} cardId="c1" onQuickReply={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sim' }));
    rerender(<AssistantCardView card={confirmCard} cardId="c1" failureToken="c1:1" error="Falhou" onQuickReply={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toBe('Falhou');
    expect(screen.getByRole('button', { name: 'Sim' }).hasAttribute('disabled')).toBe(false);
  });

  it('emits message:schedule on yes without a quick reply', () => {
    const { socket, onQuickReply, hook } = setup(cardMessage('c1', confirmCard));

    act(() => hook.result.current.handleCardReply('c1', yes));

    expect(onQuickReply).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      'message:schedule',
      expect.objectContaining({
        cardId: 'c1',
        roomId: 'room-9',
        sendAt: Date.UTC(2026, 10, 27, 12, 0),
        content: 'oi',
        type: 'text',
        clientTempId: expect.stringMatching(/.+/) as string,
        messageId: expect.stringMatching(/.+/) as string,
      }),
    );
  });

  it('reports a server error for the card and clears it when the card resolves', () => {
    const { socket, receive, hook } = setup(cardMessage('c1', confirmCard));
    act(() => hook.result.current.handleCardReply('c1', yes));
    const clientTempId = (socket.emit.mock.calls[0]?.[1] as { clientTempId: string }).clientTempId;

    act(() => receive('error', { message: 'Sem permissão', code: 'message.scheduleNotAllowed', clientTempId }));
    expect(hook.result.current.failures.get('c1')?.error).toBeTruthy();

    act(() => receive('message:card-resolved', { roomId: 'room-1', cardId: 'c1', choice: 'yes' }));
    expect(hook.result.current.failures.has('c1')).toBe(false);
  });

  it('uses the normal quick reply for no', () => {
    const { socket, onQuickReply, hook } = setup(cardMessage('c1', confirmCard));
    act(() => hook.result.current.handleCardReply('c1', no));
    expect(onQuickReply).toHaveBeenCalledWith('c1', no);
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('send-now sends the text to the card room and then resolves the card', async () => {
    sendTextToRoom.mockResolvedValue(undefined);
    const { socket, onQuickReply, hook } = setup(cardMessage('f1', failedCard));

    await act(() => {
      hook.result.current.handleCardReply('f1', sendNowButton);
      return Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(sendTextToRoom).toHaveBeenCalledWith(socket, 'room-9', 'oi', expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/));
      expect(onQuickReply).toHaveBeenCalledWith('f1', sendNowButton);
    });
  });

  it('send-now keeps the card open and reports the failure', async () => {
    sendTextToRoom.mockRejectedValue(new Error('offline'));
    const { onQuickReply, hook } = setup(cardMessage('f1', failedCard));

    await act(() => {
      hook.result.current.handleCardReply('f1', sendNowButton);
      return Promise.resolve();
    });

    await vi.waitFor(() => expect(hook.result.current.failures.get('f1')?.error).toBe('chat.assistant.card.sendNowFailed'));
    expect(onQuickReply).not.toHaveBeenCalled();
    expect(hook.result.current.failures.get('f1')?.error).toBe('chat.assistant.card.sendNowFailed');
  });
});
