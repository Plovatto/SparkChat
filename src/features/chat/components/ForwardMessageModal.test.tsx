import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomParticipant, RoomSummary } from '@lib/socket';
import type { ChatMessage } from '../types';

const forwardMessage = vi.fn((..._args: unknown[]) => Promise.resolve());
const fakeSocket = { id: 'socket' };

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options && 'count' in options ? `${key}:${String(options.count)}` : key),
  }),
}));

vi.mock('@lib/i18n/app-i18n', () => ({
  translate: (key: string, options?: Record<string, unknown>) => (options && 'name' in options ? `${key}:${String(options.name)}` : key),
}));

vi.mock('@features/theme', () => ({
  useTheme: () => ({ theme: new Proxy({}, { get: () => '#123456' }) }),
}));

vi.mock('@features/profile-photos/components/Avatar', () => ({
  Avatar: () => <span data-testid="avatar" />,
}));

vi.mock('@components/common/Spinner', () => ({
  Spinner: () => null,
}));

vi.mock('@lib/socket', () => ({
  useSocket: () => ({ socket: fakeSocket }),
}));

vi.mock('@lib/e2ee', () => ({
  MissingRoomKeyError: class MissingRoomKeyError extends Error {},
}));

vi.mock('../utils/forward-message', () => ({
  forwardMessage: (...args: unknown[]) => forwardMessage(...args),
}));

vi.mock('@features/rooms', async () => import('@features/rooms/utils/room-display'));

vi.mock('@features/auth/constants/avatars', () => ({
  AVATARS: [{ color: '#123456' }],
}));

vi.mock('../styles/forward-modal.css', () => ({}));

const { ForwardMessageModal } = await import('./ForwardMessageModal');

function participant(id: string, nickname: string, status: 'online' | 'offline' = 'offline'): RoomParticipant {
  return { id, nickname, avatar: 0, status, statusText: null, lastSeen: '', isAdmin: false };
}

function room(id: string, overrides: Partial<RoomSummary>): RoomSummary {
  return {
    id,
    type: 'private',
    participants: [],
    lastMessage: null,
    unreadCount: 0,
    mentionCount: 0,
    blockedBy: {},
    isBlockedBy: false,
    userBlocked: false,
    isMutuallyBlocked: false,
    ...overrides,
  };
}

const me = participant('me', 'Me');
const ROOMS: RoomSummary[] = [
  room('r1', { participants: [me, participant('u1', 'Joana', 'online')] }),
  room('r2', { type: 'group', name: 'Equipe Ágil', participants: [me, participant('u2', 'Leo'), participant('u3', 'Bia')] }),
  room('r3', { participants: [me, participant('u4', 'Blocked')], userBlocked: true }),
];

function message(id: string, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    roomId: 'origin',
    sender: { id: 'me', nickname: 'Me', avatar: 0 },
    content: 'Olá pessoal',
    type: 'text',
    duration: null,
    timestamp: '2026-11-20T10:00:00.000Z',
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
    ...overrides,
  };
}

function renderModal(messages: ChatMessage[] = [message('m1')], onClose = vi.fn()) {
  render(
    <ForwardMessageModal isOpen onClose={onClose} rooms={ROOMS} currentUserId="me" messages={messages} auth={{} as never} />,
  );
  return { onClose };
}

afterEach(() => {
  forwardMessage.mockClear();
  vi.useRealTimers();
});

describe('ForwardMessageModal', () => {
  it('shows the custom header, the message preview and only unblocked rooms with their details', () => {
    renderModal([message('m1'), message('m2'), message('m3')]);

    expect(screen.getByRole('heading', { name: 'chat.forward.title' })).toBeTruthy();
    expect(screen.getByText('chat.forward.subtitle')).toBeTruthy();
    expect(screen.getByText('Olá pessoal')).toBeTruthy();
    expect(screen.getByText('chat.forward.moreMessages:2')).toBeTruthy();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getByText('presence.online')).toBeTruthy();
    expect(screen.getByText('chat.forward.groupMembers:3')).toBeTruthy();
  });

  it('uses a media label as preview for attachments', () => {
    renderModal([message('m1', { type: 'file', content: 'blob:x', fileMeta: { name: 'doc.pdf', mimeType: 'application/pdf', size: 1 } })]);

    expect(screen.getByText('notifications.sentNamedFile:doc.pdf')).toBeTruthy();
  });

  it('filters rooms by name ignoring accents and case', () => {
    renderModal();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'equipe agil' } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByText('Equipe Ágil')).toBeTruthy();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByText('sidebar.noResults')).toBeTruthy();
  });

  it('forwards every message to the selected rooms and closes afterwards', async () => {
    vi.useFakeTimers();
    const { onClose } = renderModal([message('m1'), message('m2')]);
    const submit = screen.getByRole<HTMLButtonElement>('button', { name: 'chat.message.forward' });
    expect(submit.disabled).toBe(true);

    fireEvent.click(screen.getByText('Joana'));
    fireEvent.keyDown(screen.getByText('Equipe Ágil').closest('[role="checkbox"]') as HTMLElement, { key: ' ' });
    expect(screen.getAllByRole('checkbox').every((row) => row.getAttribute('aria-checked') === 'true')).toBe(true);

    const ready = screen.getByRole<HTMLButtonElement>('button', { name: 'chat.forward.submitTo:2' });
    expect(ready.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(ready);
      await Promise.resolve();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(forwardMessage).toHaveBeenCalledTimes(4);
    expect(forwardMessage.mock.calls.map((call) => call[3])).toEqual(['r1', 'r1', 'r2', 'r2']);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from the header close button', () => {
    const { onClose } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
