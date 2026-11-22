import type { MessageSender, RoomParticipant } from '@lib/socket';

export function resolveSenderAvatar(participants: readonly RoomParticipant[], sender: MessageSender): number | undefined {
  const rosterAvatar = participants.find((participant) => participant.id === sender.id)?.avatar;
  return rosterAvatar ?? sender.avatar ?? undefined;
}
