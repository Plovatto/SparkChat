import { useCallback, useEffect, useRef, useState } from 'react';
import { clearIdentity, clearRoomKeys } from '@lib/e2ee';
import { clearStoredSession, getStoredSession, saveSession } from '../api/session-storage';
import type { PendingE2eCredential, User } from '../types';

const INITIAL_LOAD_DELAY_MS = 800;
const LOGOUT_TRANSITION_DELAY_MS = 300;

export interface AuthSession {
  user: User | null;
  isRestoring: boolean;
  login: (user: User, e2eCredential?: PendingE2eCredential) => void;
  logout: () => void;
  updateUser: (patch: Partial<User>) => void;
  consumePendingE2eCredential: () => PendingE2eCredential | null;
}

export function useAuthSession(): AuthSession {
  const [user, setUser] = useState<User | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const pendingE2eCredentialRef = useRef<PendingE2eCredential | null>(null);

  useEffect(() => {
    const stored = getStoredSession();
    const timer = setTimeout(() => {
      setUser(stored);
      setIsRestoring(false);
    }, INITIAL_LOAD_DELAY_MS);

    return () => clearTimeout(timer);
  }, []);

  const login = useCallback((nextUser: User, e2eCredential?: PendingE2eCredential) => {
    pendingE2eCredentialRef.current = e2eCredential ?? null;
    setUser(nextUser);
    saveSession(nextUser);
  }, []);

  const logout = useCallback(() => {
    setIsRestoring(true);
    setUser(null);
    clearStoredSession();
    void clearIdentity();
    void clearRoomKeys();
    setTimeout(() => setIsRestoring(false), LOGOUT_TRANSITION_DELAY_MS);
  }, []);

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser((previous) => {
      if (!previous) {
        return previous;
      }
      const next = { ...previous, ...patch };
      saveSession(next);
      return next;
    });
  }, []);

  const consumePendingE2eCredential = useCallback((): PendingE2eCredential | null => {
    const credential = pendingE2eCredentialRef.current;
    pendingE2eCredentialRef.current = null;
    return credential;
  }, []);

  return { user, isRestoring, login, logout, updateUser, consumePendingE2eCredential };
}
