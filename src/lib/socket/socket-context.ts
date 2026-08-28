import { createContext, use } from 'react';
import type { AppSocket } from './socket-client';

export interface SocketContextValue {
  socket: AppSocket | null;
  connected: boolean;
}

export const SocketContext = createContext<SocketContextValue | undefined>(undefined);

export function useSocket(): SocketContextValue {
  const context = use(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
