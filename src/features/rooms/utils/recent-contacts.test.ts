import { describe, expect, it, vi } from 'vitest';
import type { RoomSummary } from '@lib/socket';

vi.mock('@lib/i18n/app-i18n', () => ({ translate: (key: string) => key }));

const { recentContacts } = await import('./recent-contacts');

function privateRoom(id: string, otherId: string, nickname: string, timestamp: string | null, extra: Partial<RoomSummary> = {}): RoomSummary {
  return {
    id,
    type: 'private',
    name: '',
    participants: [
      { id: 'me', nickname: 'eu', avatar: 0 },
      { id: otherId, nickname, avatar: 1 },
    ],
    lastMessage: timestamp ? { timestamp } : null,
    ...extra,
  } as unknown as RoomSummary;
}

describe('recentContacts', () => {
  it('lists private contacts by latest activity, skipping groups and duplicates', () => {
    const rooms = [
      privateRoom('r1', 'u1', 'ana', '2026-11-20T10:00:00Z'),
      privateRoom('r2', 'u2', 'bia', '2026-11-20T12:00:00Z'),
      { ...privateRoom('g1', 'u9', 'grupo', '2026-11-20T13:00:00Z'), type: 'group' } as RoomSummary,
      privateRoom('r3', 'u1', 'ana', '2026-11-19T10:00:00Z'),
      privateRoom('r4', 'u3', 'caio', null),
    ];
    expect(recentContacts(rooms, 'me').map((contact) => contact.nickname)).toEqual(['bia', 'ana', 'caio']);
  });

  it('respects the limit', () => {
    const rooms = Array.from({ length: 6 }, (_, index) => privateRoom(`r${index}`, `u${index}`, `user${index}`, `2026-11-20T1${index}:00:00Z`));
    expect(recentContacts(rooms, 'me', 2)).toHaveLength(2);
  });
});
