import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from './socket-events';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createSocket(url: string): AppSocket {
  return io(url, {
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });
}
