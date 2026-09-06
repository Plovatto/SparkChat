import { useCallback, useEffect, useRef } from 'react';
import { useSocket, type AuthMethod, type SocketUser } from '@lib/socket';
import type { PendingRegistration, User } from '../types';

export interface RegisteredPayload {
  user: SocketUser;
  sessionToken: string;
  recoveryFile: string;
  recoveryToken: string;
  authMethod: AuthMethod;
}

export interface ResumedPayload {
  user: SocketUser;
  authMethod: AuthMethod;
}

export interface AuthFailedPayload {
  mode: 'register' | 'resume';
  reason: 'invalid' | 'temporary';
  message: string;
}

export interface SocketAuthSyncOptions {
  user: User | null;
  pendingRegistration: PendingRegistration | null;
  onRegistered: (payload: RegisteredPayload) => void;
  onResumed: (payload: ResumedPayload) => void;
  onResumeFailed: () => void;
  onRegisterFailed: (message: string) => void;
  onSessionRevoked: () => void;
}

const AUTH_RETRY_DELAY_MS = 2000;
const LIVENESS_PROBE_TIMEOUT_MS = 3000;

export function useSocketAuthSync({
  user,
  pendingRegistration,
  onRegistered,
  onResumed,
  onResumeFailed,
  onRegisterFailed,
  onSessionRevoked,
}: SocketAuthSyncOptions): void {
  const { socket } = useSocket();
  const credentialsRef = useRef({ user, pendingRegistration });
  const retryTimeoutRef = useRef<number | null>(null);
  const emitJoinRef = useRef<() => void>(() => undefined);
  const rejectedResumesRef = useRef(0);

  credentialsRef.current = { user, pendingRegistration };

  const identityKey = user ? `resume:${user.id}` : pendingRegistration ? `register:${pendingRegistration.nickname}` : null;

  const clearRetry = useCallback(() => {
    if (retryTimeoutRef.current !== null) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!socket || !identityKey) {
      return;
    }

    const emitJoin = () => {
      const { user: currentUser, pendingRegistration: currentRegistration } = credentialsRef.current;

      if (currentUser) {
        socket.emit('user:join', { mode: 'resume', userId: currentUser.id, sessionToken: currentUser.sessionToken });
        return;
      }

      if (currentRegistration) {
        socket.emit('user:join', {
          mode: 'register',
          nickname: currentRegistration.nickname,
          avatar: currentRegistration.avatar,
          password: currentRegistration.password,
        });
      }
    };

    emitJoinRef.current = emitJoin;

    const handleConnect = () => {
      rejectedResumesRef.current = 0;
      emitJoin();
    };

    if (socket.connected) {
      handleConnect();
    }

    socket.on('connect', handleConnect);
    return () => {
      socket.off('connect', handleConnect);
      clearRetry();
    };
  }, [socket, identityKey, clearRetry]);

  useEffect(() => {
    if (!socket || !user) {
      return;
    }

    let probeTimer: number | null = null;

    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';

      if (!isVisible) {
        socket.emit('user:visibility', { visible: false });
        return;
      }

      if (!socket.connected) {
        socket.connect();
        return;
      }

      let acknowledged = false;
      if (probeTimer !== null) {
        window.clearTimeout(probeTimer);
      }
      probeTimer = window.setTimeout(() => {
        probeTimer = null;
        if (!acknowledged && socket.connected) {
          socket.disconnect().connect();
        }
      }, LIVENESS_PROBE_TIMEOUT_MS);

      socket.emit('user:visibility', { visible: true }, () => {
        acknowledged = true;
      });
    };

    handleVisibilityChange();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handleVisibilityChange);
    window.addEventListener('online', handleVisibilityChange);
    return () => {
      if (probeTimer !== null) {
        window.clearTimeout(probeTimer);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handleVisibilityChange);
      window.removeEventListener('online', handleVisibilityChange);
    };
  }, [socket, user]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleRegistered = (payload: RegisteredPayload) => {
      clearRetry();
      onRegistered(payload);
    };

    const handleResumed = (payload: ResumedPayload) => {
      clearRetry();
      rejectedResumesRef.current = 0;
      onResumed(payload);
    };

    const scheduleRejoin = () => {
      clearRetry();
      retryTimeoutRef.current = window.setTimeout(() => {
        retryTimeoutRef.current = null;
        if (socket.connected) {
          emitJoinRef.current();
        }
      }, AUTH_RETRY_DELAY_MS);
    };

    const handleAuthFailed = ({ mode, reason, message }: AuthFailedPayload) => {
      if (reason === 'temporary') {
        scheduleRejoin();
        return;
      }

      if (mode === 'register') {
        clearRetry();
        onRegisterFailed(message);
        return;
      }

      if (rejectedResumesRef.current === 0) {
        rejectedResumesRef.current = 1;
        scheduleRejoin();
        return;
      }

      clearRetry();
      onResumeFailed();
    };

    const handleSessionRevoked = () => {
      clearRetry();
      onSessionRevoked();
    };

    socket.on('user:registered', handleRegistered);
    socket.on('user:resumed', handleResumed);
    socket.on('user:auth-failed', handleAuthFailed);
    socket.on('user:session-revoked', handleSessionRevoked);

    return () => {
      socket.off('user:registered', handleRegistered);
      socket.off('user:resumed', handleResumed);
      socket.off('user:auth-failed', handleAuthFailed);
      socket.off('user:session-revoked', handleSessionRevoked);
    };
  }, [socket, onRegistered, onResumed, onResumeFailed, onRegisterFailed, onSessionRevoked, clearRetry]);
}
