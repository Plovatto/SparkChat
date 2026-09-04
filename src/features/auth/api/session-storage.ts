import { getItem, setItem } from '@lib/storage';
import type { User } from '../types';

const SESSION_KEY = 'sparkchat:session';

export function saveSession(user: User): void {
  const stored: User = {
    id: user.id,
    nickname: user.nickname,
    avatar: user.avatar,
    sessionToken: user.sessionToken,
    ...(user.authMethod ? { authMethod: user.authMethod } : {}),
    ...(user.status ? { status: user.status } : {}),
    ...(user.statusText !== undefined ? { statusText: user.statusText } : {}),
    ...(user.theme ? { theme: user.theme } : {}),
  };

  setItem(SESSION_KEY, stored);
}

export function getStoredSession(): User | null {
  return getItem<User>(SESSION_KEY);
}
