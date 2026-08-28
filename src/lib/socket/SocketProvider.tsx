import { useEffect, useState, type PropsWithChildren } from 'react';
import { env } from '@config/env';
import { createSocket, type AppSocket } from './socket-client';
import { SocketContext } from './socket-context';

interface SocketProviderProps {
  enabled: boolean;
}

export function SocketProvider({ children, enabled }: PropsWithChildren<SocketProviderProps>) {
  const [socket, setSocket] = useState<AppSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const instance = createSocket(env.socketUrl);
    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    instance.on('connect', handleConnect);
    instance.on('disconnect', handleDisconnect);
    setSocket(instance);

    return () => {
      instance.off('connect', handleConnect);
      instance.off('disconnect', handleDisconnect);
      instance.close();
      setSocket(null);
      setConnected(false);
    };
  }, [enabled]);

  return <SocketContext value={{ socket, connected }}>{children}</SocketContext>;
}
