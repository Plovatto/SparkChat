import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomParticipant, RoomSummary } from '@lib/socket';
import { ChatHeader } from './ChatHeader';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@features/theme', () => ({
  useTheme: () => ({ theme: new Proxy({}, { get: () => '#123456' }) }),
}));

vi.mock('@features/profile-photos/components/Avatar', () => ({
  Avatar: ({ children }: { children?: React.ReactNode }) => <span data-testid="avatar">{children}</span>,
}));

vi.mock('@features/calls', () => ({
  useOptionalCall: () => null,
}));

vi.mock('@features/rooms', async () => import('@features/rooms/utils/room-display'));

vi.mock('../hooks/useGroupInviteLink', () => ({
  useGroupInviteLink: () => ({ isAvailable: false, createLink: () => Promise.resolve(null) }),
}));

function participant(id: string, nickname: string, status: 'online' | 'offline', statusText: string | null = null): RoomParticipant {
  return { id, nickname, avatar: 0, status, statusText, lastSeen: '', isAdmin: false };
}

function privateRoom(other: RoomParticipant): RoomSummary {
  return {
    id: 'room-1',
    type: 'private',
    participants: [participant('me', 'Me', 'online'), other],
    lastMessage: null,
    unreadCount: 0,
    mentionCount: 0,
    blockedBy: {},
    isBlockedBy: false,
    userBlocked: false,
    isMutuallyBlocked: false,
  };
}

function duplicateKeyErrors(calls: unknown[][]): unknown[][] {
  return calls.filter((call) => call.some((part) => typeof part === 'string' && part.includes('same key')));
}

describe('ChatHeader', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['offline', participant('u1', 'Joana', 'offline')],
    ['online', participant('u1', 'Joana', 'online')],
  ])('renders the %s presence without duplicate React keys', (status, other) => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { rerender } = render(<ChatHeader room={privateRoom(other)} currentUserId="me" onBack={vi.fn()} onOpenInfo={vi.fn()} />);
    rerender(<ChatHeader room={privateRoom(participant('u1', 'Joana', status === 'online' ? 'offline' : 'online'))} currentUserId="me" onBack={vi.fn()} onOpenInfo={vi.fn()} />);

    expect(screen.getByText('Joana')).toBeTruthy();
    expect(duplicateKeyErrors(errorSpy.mock.calls)).toEqual([]);
  });
});
