import type { AppSocket } from './socket-client';

const AUTHENTICATED_EVENTS = ['user:resumed', 'user:registered'] as const;

export interface SocketRequest<T> {
  socket: AppSocket;
  send: () => void;
  listen: (settle: (value: T | Promise<T>) => void) => () => void;
  fallback: T;
  replyTimeoutMs: number;
  maxWaitMs: number;
}

export function requestOverSocket<T>({ socket, send, listen, fallback, replyTimeoutMs, maxWaitMs }: SocketRequest<T>): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    let resendOnAuth = false;
    let replyTimer: ReturnType<typeof setTimeout> | undefined;
    let stopListening: () => void = () => undefined;

    const armReply = () => {
      clearTimeout(replyTimer);
      replyTimer = setTimeout(() => finish(fallback), replyTimeoutMs);
    };

    const onDisconnect = () => {
      clearTimeout(replyTimer);
      resendOnAuth = true;
    };

    const onAuthenticated = () => {
      if (resendOnAuth) {
        resendOnAuth = false;
        send();
      }
      armReply();
    };

    const capTimer = setTimeout(() => finish(fallback), maxWaitMs);

    function finish(value: T | Promise<T>) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(replyTimer);
      clearTimeout(capTimer);
      stopListening();
      socket.off('disconnect', onDisconnect);
      for (const event of AUTHENTICATED_EVENTS) {
        socket.off(event, onAuthenticated);
      }
      resolve(value);
    }

    stopListening = listen(finish);
    socket.on('disconnect', onDisconnect);
    for (const event of AUTHENTICATED_EVENTS) {
      socket.on(event, onAuthenticated);
    }
    send();
    if (socket.connected !== false) {
      armReply();
    }
  });
}
