import { describe, expect, it } from 'vitest';
import type { RoomSummary } from '@lib/socket';
import { isPrivateRoomWith } from './call-peer';

function room(overrides: Partial<RoomSummary>, ids: string[]): RoomSummary {
  return {
    id: 'room-1',
    type: 'private',
    participants: ids.map((id) => ({ id, nickname: id, avatar: 0, status: 'online', statusText: null, lastSeen: '', isAdmin: false })),
    ...overrides,
  } as RoomSummary;
}

describe('isPrivateRoomWith', () => {
  it('accepts a private room with exactly self and the caller and the matching id', () => {
    expect(isPrivateRoomWith([room({}, ['me', 'ana'])], 'room-1', 'me', 'ana')).toBe(true);
  });

  it('rejects unknown rooms, other ids, groups and rooms with extra members', () => {
    expect(isPrivateRoomWith([], 'room-1', 'me', 'ana')).toBe(false);
    expect(isPrivateRoomWith([room({}, ['me', 'ana'])], 'room-2', 'me', 'ana')).toBe(false);
    expect(isPrivateRoomWith([room({}, ['me', 'bia'])], 'room-1', 'me', 'ana')).toBe(false);
    expect(isPrivateRoomWith([room({ type: 'group' }, ['me', 'ana'])], 'room-1', 'me', 'ana')).toBe(false);
    expect(isPrivateRoomWith([room({}, ['me', 'ana', 'bia'])], 'room-1', 'me', 'ana')).toBe(false);
  });
});
