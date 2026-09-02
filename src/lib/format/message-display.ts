export function getDisplayName(senderId: string, nickname: string, currentUserId: string | undefined): string {
  return senderId === currentUserId ? 'Você' : nickname;
}

export function processSystemMessage(content: string, currentNickname: string): string {
  if (!currentNickname) {
    return content;
  }
  return content.replace(new RegExp(`\\b${currentNickname}\\b`, 'g'), 'Você');
}

const SYSTEM_MESSAGE_ACTION_SUFFIXES = ['criou o grupo', 'entrou no grupo', 'saiu do grupo'];

export function splitSystemMessageActor(content: string): { actor: string; rest: string } | null {
  const suffix = SYSTEM_MESSAGE_ACTION_SUFFIXES.find((candidate) => content.endsWith(candidate));
  if (!suffix) {
    return null;
  }

  const actor = content.slice(0, content.length - suffix.length).trimEnd();
  if (!actor) {
    return null;
  }

  return { actor, rest: content.slice(actor.length) };
}
