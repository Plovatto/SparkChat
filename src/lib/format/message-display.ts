import { translate } from '@lib/i18n/app-i18n';

export function getDisplayName(senderId: string, nickname: string, currentUserId: string | undefined, isUnknown = false): string {
  if (senderId === currentUserId) {
    return translate('common.you');
  }
  return isUnknown ? translate('common.unknownUser') : nickname;
}

export function resolveActiveUserNames(
  userIds: string[],
  participants: { id: string; nickname: string }[],
  currentUserId?: string,
): string[] {
  return userIds
    .map((userId) => participants.find((participant) => participant.id === userId))
    .filter((participant): participant is { id: string; nickname: string } => Boolean(participant))
    .map((participant) => getDisplayName(participant.id, participant.nickname, currentUserId));
}
