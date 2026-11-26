import { useEffect, useRef } from 'react';
import type { AppSocket } from '@lib/socket';
import { takePendingLaunch, takePendingReminder } from '../lib/launch-params';
import { queueReminderAction } from '../lib/reminder-actions';
import { syncPushSubscription } from '../lib/push-subscription';
import { onWorkerMessage, postToWorker } from '../lib/sw-registration';

interface PwaChatShellOptions {
  socket: AppSocket | null;
  selectedRoomId: string | null;
  language: 'pt' | 'en';
  onOpenRoom: (roomId: string) => void;
  onNewChat: () => void;
}

function syncQuietly(socket: AppSocket): void {
  void syncPushSubscription(socket).catch(() => null);
}

export function usePwaChatShell({ socket, selectedRoomId, language, onOpenRoom, onNewChat }: PwaChatShellOptions): void {
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
    const reminder = takePendingReminder();
    if (reminder) {
      handlersRef.current.onOpenRoom(reminder.roomId);
      queueReminderAction(reminder);
    }
  }, []);

  useEffect(
    () =>
      onWorkerMessage((message) => {
        if (message.type === 'sparkchat:open-room') {
          handlersRef.current.onOpenRoom(message.roomId);
        } else if (message.type === 'sparkchat:reminder-action') {
          handlersRef.current.onOpenRoom(message.roomId);
          queueReminderAction({ reminderId: message.reminderId, roomId: message.roomId, action: message.action });
        } else if (message.type === 'sparkchat:push-subscription-changed' && socket) {
          syncQuietly(socket);
        }
      }),
    [socket],
  );

  useEffect(() => {
    if (!socket) {
      return;
    }
    if (socket.connected) {
      syncQuietly(socket);
    }
    const handleResumed = () => syncQuietly(socket);
    socket.on('user:resumed', handleResumed);
    return () => {
      socket.off('user:resumed', handleResumed);
    };
  }, [socket]);

  useEffect(() => {
    const permissions = typeof navigator === 'undefined' ? undefined : navigator.permissions;
    if (!socket || typeof permissions?.query !== 'function') {
      return;
    }
    let active = true;
    let status: PermissionStatus | null = null;
    const handleChange = () => {
      if (status?.state === 'granted') {
        syncQuietly(socket);
      }
    };
    permissions
      .query({ name: 'notifications' })
      .then((value) => {
        if (active) {
          status = value;
          status.addEventListener('change', handleChange);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
      status?.removeEventListener('change', handleChange);
    };
  }, [socket]);

  useEffect(() => {
    postToWorker({ type: 'sparkchat:active-room', roomId: selectedRoomId });
  }, [selectedRoomId]);

  useEffect(() => {
    postToWorker({ type: 'sparkchat:locale', language });
  }, [language]);
}
