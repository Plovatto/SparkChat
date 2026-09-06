import { useEffect, useRef } from 'react';
import type { SocketChatSettings, SocketUser } from '@lib/socket';
import { useSocket } from '@lib/socket';
import type { ChatSettings } from '../constants/chat-appearance';
import { useTheme } from '../theme-context';

function serialize(settings: ChatSettings): string {
  return JSON.stringify(settings, Object.keys(settings).sort());
}

function isEmpty(settings: ChatSettings): boolean {
  return (
    Object.keys(settings.roomWallpapers).length === 0 &&
    Object.keys(settings.roomAppearance).length === 0 &&
    settings.globalWallpaper === null &&
    settings.globalAppearance === null
  );
}

function normalize(settings: SocketChatSettings): ChatSettings {
  return {
    roomWallpapers: settings.roomWallpapers ?? {},
    globalWallpaper: settings.globalWallpaper ?? null,
    roomAppearance: settings.roomAppearance ?? {},
    globalAppearance: settings.globalAppearance ?? null,
  };
}

export function useChatSettingsSync(): void {
  const { socket } = useSocket();
  const { chatSettings, applyChatSettings } = useTheme();
  const lastSyncedRef = useRef<string | null>(null);
  const hasResolvedRef = useRef(false);
  const localRef = useRef(chatSettings);
  localRef.current = chatSettings;

  useEffect(() => {
    if (!socket) {
      hasResolvedRef.current = false;
      lastSyncedRef.current = null;
      return;
    }

    const resolveFromServer = ({ user }: { user: SocketUser }) => {
      const local = localRef.current;
      const server = user.chatSettings ? normalize(user.chatSettings) : null;
      hasResolvedRef.current = true;

      if (!server || isEmpty(server)) {
        lastSyncedRef.current = serialize(local);
        if (!isEmpty(local)) {
          socket.emit('user:update-chat-settings', local);
        }
        return;
      }

      lastSyncedRef.current = serialize(server);
      applyChatSettings(server);
    };

    const applyRemoteChange = ({ chatSettings: incoming }: { chatSettings: SocketChatSettings }) => {
      const next = normalize(incoming);
      lastSyncedRef.current = serialize(next);
      applyChatSettings(next);
    };

    socket.on('user:resumed', resolveFromServer);
    socket.on('user:registered', resolveFromServer);
    socket.on('user:chat-settings-updated', applyRemoteChange);

    return () => {
      socket.off('user:resumed', resolveFromServer);
      socket.off('user:registered', resolveFromServer);
      socket.off('user:chat-settings-updated', applyRemoteChange);
    };
  }, [socket, applyChatSettings]);

  useEffect(() => {
    if (!socket || !hasResolvedRef.current) {
      return;
    }

    const serialized = serialize(chatSettings);
    if (lastSyncedRef.current === serialized) {
      return;
    }

    lastSyncedRef.current = serialized;
    socket.emit('user:update-chat-settings', chatSettings);
  }, [socket, chatSettings]);
}
