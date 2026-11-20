import { describe, expect, it } from 'vitest';
import type { RoomSummary } from '@lib/socket';
import { countUnreadRooms, filterRooms, hasUnread, normalizeSearchText } from './room-filters';

function room(overrides: Partial<RoomSummary> & Pick<RoomSummary, 'id'>): RoomSummary {
  return {
    type: 'private',
    participants: [{ id: 'me', nickname: 'Me' }],
    lastMessage: null,
    unreadCount: 0,
    mentionCount: 0,
    blockedBy: {},
    isBlockedBy: false,
    userBlocked: false,
    isMutuallyBlocked: false,
    ...overrides,
  } as RoomSummary;
}

const joao = room({ id: 'joao', participants: [{ id: 'me', nickname: 'Me' }, { id: 'j', nickname: 'João' }] as RoomSummary['participants'], unreadCount: 3 });
const ana = room({ id: 'ana', participants: [{ id: 'me', nickname: 'Me' }, { id: 'a', nickname: 'Ana' }] as RoomSummary['participants'] });
const viagem = room({ id: 'viagem', type: 'group', name: 'Viagem de Férias', mentionCount: 1 });
const trabalho = room({ id: 'trabalho', type: 'group', name: 'Trabalho' });
const rooms = [joao, ana, viagem, trabalho];

describe('room filters', () => {
  it('normalizes accents, case and surrounding spaces', () => {
    expect(normalizeSearchText('  FÉRIAS João ')).toBe('ferias joao');
  });

  it('treats unread messages and unread mentions as unread', () => {
    expect(hasUnread(joao)).toBe(true);
    expect(hasUnread(viagem)).toBe(true);
    expect(hasUnread(ana)).toBe(false);
    expect(countUnreadRooms(rooms)).toBe(2);
  });

  it('keeps every room for the all filter with an empty search', () => {
    expect(filterRooms(rooms, 'all', '', 'me')).toEqual(rooms);
  });

  it('keeps only unread rooms or only groups', () => {
    expect(filterRooms(rooms, 'unread', '', 'me')).toEqual([joao, viagem]);
    expect(filterRooms(rooms, 'groups', '', 'me')).toEqual([viagem, trabalho]);
  });

  it('searches the name shown in the list, ignoring accents and case', () => {
    expect(filterRooms(rooms, 'all', 'joao', 'me')).toEqual([joao]);
    expect(filterRooms(rooms, 'all', 'FERIAS', 'me')).toEqual([viagem]);
    expect(filterRooms(rooms, 'all', 'me', 'me')).toEqual([]);
  });

  it('combines the search with the active filter', () => {
    expect(filterRooms(rooms, 'groups', 'tra', 'me')).toEqual([trabalho]);
    expect(filterRooms(rooms, 'unread', 'tra', 'me')).toEqual([]);
  });
});
