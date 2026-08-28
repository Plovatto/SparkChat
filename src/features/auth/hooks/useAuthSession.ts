import { useCallback, useEffect, useState } from 'react';
import { clearSession, getStoredSession, saveSession } from '../api/session-storage';
import type { User } from '../types';

const INITIAL_LOAD_DELAY_MS = 800;
const LOGOUT_TRANSITION_DELAY_MS = 300;

export interface AuthSession {
  user: User | null;
  isRestoring: boolean;
  login: (user: User) => void;
  logout: () => void;
  updateUser: (patch: Partial<User>) => void;
}

export function useAuthSession(): AuthSession {
  const [user, setUser] = useState<User | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    const stored = getStoredSession();
    const timer = setTimeout(() => {
      setUser(stored);
      setIsRestoring(false);
    }, INITIAL_LOAD_DELAY_MS);

    return () => clearTimeout(timer);
  }, []);

  const login = useCallback((nextUser: User) => {
    setUser(nextUser);
    saveSession(nextUser);
  }, []);

  const logout = useCallback(() => {
    setIsRestoring(true);
    setUser(null);
    clearSession();
    setTimeout(() => setIsRestoring(false), LOGOUT_TRANSITION_DELAY_MS);
  }, []);

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser((previous) => {
      const next = previous ? { ...previous, ...patch } : (patch as User);
      saveSession(next);
      return next;
    });
  }, []);

  return { user, isRestoring, login, logout, updateUser };
}
