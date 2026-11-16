import { io, type Socket } from 'socket.io-client';
import { currentLanguage } from '@lib/i18n/app-i18n';
import { wrapSocketWithE2e } from './e2e-socket';
import type { ClientToServerEvents, ServerToClientEvents } from './socket-events';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createSocket(url: string): AppSocket {
  const socket = io(url, {
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    transports: ['websocket', 'polling'],
    rememberUpgrade: true,
    timeout: 20000,
    auth: (callback) => callback({ locale: currentLanguage() }),
  });

  return wrapSocketWithE2e(socket);
}
