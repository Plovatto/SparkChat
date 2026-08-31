export function getDisplayName(senderId: string, nickname: string, currentUserId: string | undefined): string {
  return senderId === currentUserId ? 'Você' : nickname;
}

export function processSystemMessage(content: string, currentNickname: string): string {
  if (!currentNickname) {
    return content;
  }
  return content.replace(new RegExp(`\\b${currentNickname}\\b`, 'g'), 'Você');
}
