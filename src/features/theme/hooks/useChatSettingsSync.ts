import { useCallback, useEffect, useRef } from 'react';
import type { SocketChatSettings, SocketUser } from '@lib/socket';
import { isSocketAuthenticated, useSocket } from '@lib/socket';
import type { ChatSettings } from '../constants/chat-appearance';
import { useTheme } from '../theme-context';
import { serializeChatSettings as serialize } from '../utils/serialize-chat-settings';

export const CHAT_SETTINGS_SYNC_DEBOUNCE_MS = 400;

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
  const hasUnsyncedLocalChangeRef = useRef(false);
  const localRef = useRef(chatSettings);
  localRef.current = chatSettings;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const emitIfChanged = useCallback(
    (target: NonNullable<typeof socket>) => {
      timerRef.current = null;
      const current = localRef.current;
      const serialized = serialize(current);
      if (lastSyncedRef.current === serialized) {
        return;
      }
      lastSyncedRef.current = serialized;
      if (!isSocketAuthenticated(target)) {
        hasUnsyncedLocalChangeRef.current = true;
      }
      target.emit('user:update-chat-settings', current);
    },
    [],
  );

  useEffect(() => {
    if (!socket) {
      clearTimer();
      hasResolvedRef.current = false;
      lastSyncedRef.current = null;
      hasUnsyncedLocalChangeRef.current = false;
      return;
    }

    const resolveFromServer = ({ user }: { user: SocketUser }) => {
      const local = localRef.current;
      const server = user.chatSettings ? normalize(user.chatSettings) : null;
      hasResolvedRef.current = true;

      if (hasUnsyncedLocalChangeRef.current) {
        hasUnsyncedLocalChangeRef.current = false;
        lastSyncedRef.current = serialize(local);
        socket.emit('user:update-chat-settings', local);
        return;
      }

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
      clearTimer();
      hasUnsyncedLocalChangeRef.current = false;
      lastSyncedRef.current = serialize(next);
      applyChatSettings(next);
    };

    socket.on('user:resumed', resolveFromServer);
    socket.on('user:registered', resolveFromServer);
    socket.on('user:chat-settings-updated', applyRemoteChange);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        if (socket.active) {
          emitIfChanged(socket);
        }
        timerRef.current = null;
      }
      socket.off('user:resumed', resolveFromServer);
      socket.off('user:registered', resolveFromServer);
      socket.off('user:chat-settings-updated', applyRemoteChange);
    };
  }, [socket, applyChatSettings, clearTimer, emitIfChanged]);

  useEffect(() => {
    if (!socket || !hasResolvedRef.current || !socket.active) {
      return;
    }

    if (lastSyncedRef.current === serialize(chatSettings)) {
      clearTimer();
      return;
    }

    clearTimer();
    timerRef.current = setTimeout(() => emitIfChanged(socket), CHAT_SETTINGS_SYNC_DEBOUNCE_MS);
  }, [socket, chatSettings, clearTimer, emitIfChanged]);
}
