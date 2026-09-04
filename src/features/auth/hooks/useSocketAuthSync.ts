import { useEffect, useRef } from 'react';
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

export interface SocketAuthSyncOptions {
  user: User | null;
  pendingRegistration: PendingRegistration | null;
  onRegistered: (payload: RegisteredPayload) => void;
  onResumed: (payload: ResumedPayload) => void;
  onResumeFailed: () => void;
  onRegisterFailed: (message: string) => void;
  onSessionRevoked: () => void;
}

export function useSocketAuthSync({
  user,
  pendingRegistration,
  onRegistered,
  onResumed,
  onResumeFailed,
  onRegisterFailed,
  onSessionRevoked,
}: SocketAuthSyncOptions): void {
  const { socket, connected } = useSocket();
  const hasJoinedRef = useRef(false);
  const pendingModeRef = useRef<'register' | 'resume' | null>(null);

  useEffect(() => {
    if (!connected) {
      hasJoinedRef.current = false;
      pendingModeRef.current = null;
    }
  }, [connected]);

  useEffect(() => {
    if (!socket || !connected || hasJoinedRef.current) {
      return;
    }

    if (user) {
      hasJoinedRef.current = true;
      pendingModeRef.current = 'resume';
      socket.emit('user:join', { mode: 'resume', userId: user.id, sessionToken: user.sessionToken });
      return;
    }

    if (pendingRegistration) {
      hasJoinedRef.current = true;
      pendingModeRef.current = 'register';
      socket.emit('user:join', {
        mode: 'register',
        nickname: pendingRegistration.nickname,
        avatar: pendingRegistration.avatar,
        password: pendingRegistration.password,
      });
    }
  }, [socket, connected, user, pendingRegistration]);

  useEffect(() => {
    if (!socket || !user) {
      return;
    }

    const handleVisibilityChange = () => {
      socket.emit('user:visibility', { visible: document.visibilityState === 'visible' });
    };

    handleVisibilityChange();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [socket, user]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleRegistered = (payload: RegisteredPayload) => {
      pendingModeRef.current = null;
      onRegistered(payload);
    };

    const handleResumed = (payload: ResumedPayload) => {
      pendingModeRef.current = null;
      onResumed(payload);
    };

    const handleError = ({ message }: { message: string }) => {
      const mode = pendingModeRef.current;
      pendingModeRef.current = null;
      hasJoinedRef.current = false;

      if (mode === 'resume') {
        onResumeFailed();
      } else if (mode === 'register') {
        onRegisterFailed(message);
      }
    };

    const handleSessionRevoked = () => {
      hasJoinedRef.current = false;
      pendingModeRef.current = null;
      onSessionRevoked();
    };

    socket.on('user:registered', handleRegistered);
    socket.on('user:resumed', handleResumed);
    socket.on('error', handleError);
    socket.on('user:session-revoked', handleSessionRevoked);

    return () => {
      socket.off('user:registered', handleRegistered);
      socket.off('user:resumed', handleResumed);
      socket.off('error', handleError);
      socket.off('user:session-revoked', handleSessionRevoked);
    };
  }, [socket, onRegistered, onResumed, onResumeFailed, onRegisterFailed, onSessionRevoked]);
}
