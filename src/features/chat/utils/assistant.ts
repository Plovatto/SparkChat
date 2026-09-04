import type { RoomSummary } from '@lib/socket';

export const ASSISTANT_NICKNAME = 'SparkAI';
export const ASSISTANT_MAX_TEXT_CHARS = 2000;

export function isAssistantRoom(room: RoomSummary): boolean {
  return room.type === 'private' && room.participants.some((participant) => participant.nickname === ASSISTANT_NICKNAME);
}
