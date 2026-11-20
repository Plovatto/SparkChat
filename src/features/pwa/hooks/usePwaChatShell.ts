import { useEffect, useRef } from 'react';
import type { AppSocket } from '@lib/socket';
import { takePendingLaunch } from '../lib/launch-params';
import { syncPushSubscription } from '../lib/push-subscription';
import { onWorkerMessage, postToWorker } from '../lib/sw-registration';

interface PwaChatShellOptions {
  socket: AppSocket | null;
  connected: boolean;
  selectedRoomId: string | null;
  language: 'pt' | 'en';
  onOpenRoom: (roomId: string) => void;
  onNewChat: () => void;
}

function syncQuietly(socket: AppSocket): void {
  void syncPushSubscription(socket).catch(() => null);
}

export function usePwaChatShell({ socket, connected, selectedRoomId, language, onOpenRoom, onNewChat }: PwaChatShellOptions): void {
  const handlersRef = useRef({ onOpenRoom, onNewChat });
  handlersRef.current = { onOpenRoom, onNewChat };

  useEffect(() => {
    const launch = takePendingLaunch();
    if (launch.roomId) {
      handlersRef.current.onOpenRoom(launch.roomId);
    }
    if (launch.newChat) {
      handlersRef.current.onNewChat();
    }
  }, []);

  useEffect(
    () =>
      onWorkerMessage((message) => {
        if (message.type === 'sparkchat:open-room') {
          handlersRef.current.onOpenRoom(message.roomId);
        } else if (message.type === 'sparkchat:push-subscription-changed' && socket) {
          syncQuietly(socket);
        }
      }),
    [socket],
  );

  useEffect(() => {
    if (socket && connected) {
      syncQuietly(socket);
    }
  }, [socket, connected]);

  useEffect(() => {
    postToWorker({ type: 'sparkchat:active-room', roomId: selectedRoomId });
  }, [selectedRoomId]);

  useEffect(() => {
    postToWorker({ type: 'sparkchat:locale', language });
  }, [language]);
}
