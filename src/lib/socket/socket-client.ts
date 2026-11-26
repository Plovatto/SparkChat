import { io, type Socket } from 'socket.io-client';
import { currentLanguage } from '@lib/i18n/app-i18n';
import { currentTimeZone } from './time-zone';
import { wrapSocketWithE2e } from './e2e-socket';
import { isSocketAuthenticated, setSocketAuthenticated } from './socket-auth-state';
import type { ClientToServerEvents, ServerToClientEvents } from './socket-events';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type PendingEmit = [event: string, args: unknown[]];
type GenericEmit = (event: string, ...args: unknown[]) => AppSocket;

const PRE_AUTH_EVENTS = new Set(['user:join', 'user:visibility']);
export { isSocketAuthenticated };

function holdEmitsUntilAuthenticated(socket: AppSocket): void {
  const queue: PendingEmit[] = [];
  const genericSocket = socket as unknown as { emit: GenericEmit };
  const originalEmit = genericSocket.emit.bind(socket);

  const markAuthenticated = () => {
    setSocketAuthenticated(socket, true);
    for (const [event, args] of queue.splice(0)) {
      originalEmit(event, ...args);
    }
  };

  socket.on('user:resumed', markAuthenticated);
  socket.on('user:registered', markAuthenticated);
  socket.on('disconnect', () => {
    setSocketAuthenticated(socket, false);
  });

  genericSocket.emit = (event: string, ...args: unknown[]) => {
    if (isSocketAuthenticated(socket) || PRE_AUTH_EVENTS.has(event)) {
      return originalEmit(event, ...args);
    }
    queue.push([event, args]);
    return socket;
  };
}

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
    auth: (callback) => callback({ locale: currentLanguage(), timeZone: currentTimeZone() }),
  });

  holdEmitsUntilAuthenticated(socket);
  return wrapSocketWithE2e(socket);
}
