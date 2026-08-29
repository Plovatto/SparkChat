import { useEffect, useRef } from 'react';
import { useSocket, type SocketUser } from '@lib/socket';
import type { User } from '../types';

export interface SocketAuthSyncOptions {
  user: User | null;
  onRegistered: (user: User) => void;
  onError: (message: string) => void;
}

export function useSocketAuthSync({ user, onRegistered, onError }: SocketAuthSyncOptions): void {
  const { socket, connected } = useSocket();
  const hasJoinedRef = useRef(false);

  useEffect(() => {
    if (!connected) {
      hasJoinedRef.current = false;
    }
  }, [connected]);

  useEffect(() => {
    if (!socket || !connected || !user || hasJoinedRef.current) {
      return;
    }

    hasJoinedRef.current = true;
    socket.emit('user:join', {
      nickname: user.nickname,
      avatar: user.avatar,
      loginCode: user.loginCode ?? null,
    });
  }, [socket, connected, user]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleRegistered = ({ user: registered }: { user: SocketUser }) => {
      onRegistered(registered);
    };
    const handleError = ({ message }: { message: string }) => {
      onError(message);
    };

    socket.on('user:registered', handleRegistered);
    socket.on('user:profile-updated-success', handleRegistered);
    socket.on('error', handleError);

    return () => {
      socket.off('user:registered', handleRegistered);
      socket.off('user:profile-updated-success', handleRegistered);
      socket.off('error', handleError);
    };
  }, [socket, onRegistered, onError]);
}
