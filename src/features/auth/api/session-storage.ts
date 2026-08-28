import { getItem, removeItem, setItem } from '@lib/storage';
import type { User } from '../types';

const SESSION_KEY = 'sparkchat:session';

export function saveSession(user: User): void {
  setItem(SESSION_KEY, user);
}

export function getStoredSession(): User | null {
  return getItem<User>(SESSION_KEY);
}

export function clearSession(): void {
  removeItem(SESSION_KEY);
}
