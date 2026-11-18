export interface ProfileUpdatePayload {
  nickname: string;
  avatar: number;
  currentPassword?: string;
}

function normalizeNickname(nickname: string): string {
  return nickname.trim().toLowerCase();
}

export function isNicknameChange(currentNickname: string, nextNickname: string): boolean {
  return normalizeNickname(currentNickname) !== normalizeNickname(nextNickname);
}

export function buildProfileUpdatePayload(currentNickname: string, nextNickname: string, avatar: number, currentPassword: string): ProfileUpdatePayload {
  const payload: ProfileUpdatePayload = { nickname: nextNickname.trim(), avatar };
  if (isNicknameChange(currentNickname, nextNickname)) {
    payload.currentPassword = currentPassword;
  }
  return payload;
}
