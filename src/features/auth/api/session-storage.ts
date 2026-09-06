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

export function clearStoredSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('sparkchat:last-room:')) {
        localStorage.removeItem(key);
      }
    }
  } catch (error) {
    console.error(error);
  }
}
