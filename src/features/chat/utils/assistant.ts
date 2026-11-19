import { ASSISTANT_NICKNAME } from '@lib/e2ee/assistant';
import type { RoomSummary } from '@lib/socket';

export { ASSISTANT_NICKNAME };
export const ASSISTANT_MAX_TEXT_CHARS = 2000;

export function isAssistantRoom(room: RoomSummary): boolean {
  return room.type === 'private' && room.participants.some((participant) => participant.nickname === ASSISTANT_NICKNAME);
}
