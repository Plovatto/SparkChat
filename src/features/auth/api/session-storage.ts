import { APP_STORAGE_PREFIX, DEVICE_PREFERENCE_STORAGE_KEYS, SESSION_STORAGE_KEY as SESSION_KEY } from '@constants/storage-keys';
import { getItem, setItem } from '@lib/storage';
import type { User } from '../types';

const ACCOUNT_STORAGE_KEYS = ['chatThemePendingSync'];

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

function isAccountStorageKey(key: string): boolean {
  if (ACCOUNT_STORAGE_KEYS.includes(key)) {
    return true;
  }
  return key.startsWith(APP_STORAGE_PREFIX) && !DEVICE_PREFERENCE_STORAGE_KEYS.includes(key);
}

export function clearStoredSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key !== null && isAccountStorageKey(key)) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  } catch (error) {
    console.error(error);
  }
}
