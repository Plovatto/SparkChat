import { useEffect, useRef } from 'react';
import { isSocketAuthenticated, useSocket, type SocketUser } from '@lib/socket';
import { useTheme } from '../theme-context';

export const THEME_PENDING_SYNC_KEY = 'chatThemePendingSync';

function hasPendingThemeChange(): boolean {
  try {
    return localStorage.getItem(THEME_PENDING_SYNC_KEY) === '1';
  } catch {
    return false;
  }
}

function setPendingThemeChange(pending: boolean): void {
  try {
    if (pending) {
      localStorage.setItem(THEME_PENDING_SYNC_KEY, '1');
    } else {
      localStorage.removeItem(THEME_PENDING_SYNC_KEY);
    }
  } catch {
    return;
  }
}

export function useThemeSync(): void {
  const { socket } = useSocket();
  const { baseTheme, colorTheme, changeTheme } = useTheme();
  const lastSyncedThemeId = useRef<string | null>(null);
  const hasResolvedServerTheme = useRef(false);
  const localThemeRef = useRef({ baseTheme, colorTheme });
  localThemeRef.current = { baseTheme, colorTheme };

  useEffect(() => {
    if (!socket) {
      hasResolvedServerTheme.current = false;
      lastSyncedThemeId.current = null;
      return;
    }

    const resolveFromServer = ({ user }: { user: SocketUser }) => {
      hasResolvedServerTheme.current = true;
      const { baseTheme: localBase, colorTheme: localColor } = localThemeRef.current;
      const localThemeId = `${localBase}-${localColor}`;
      const serverThemeId = user.theme ? `${user.theme.baseTheme}-${user.theme.colorTheme}` : null;

      if (serverThemeId === localThemeId) {
        lastSyncedThemeId.current = localThemeId;
        setPendingThemeChange(false);
        return;
      }

      if (!serverThemeId || hasPendingThemeChange()) {
        lastSyncedThemeId.current = localThemeId;
        setPendingThemeChange(false);
        socket.emit('user:update-theme', { baseTheme: localBase, colorTheme: localColor });
        return;
      }

      lastSyncedThemeId.current = serverThemeId;
      changeTheme(serverThemeId);
    };

    socket.on('user:resumed', resolveFromServer);
    socket.on('user:registered', resolveFromServer);
    return () => {
      socket.off('user:resumed', resolveFromServer);
      socket.off('user:registered', resolveFromServer);
    };
  }, [socket, changeTheme]);

  useEffect(() => {
    if (!socket || !hasResolvedServerTheme.current || !socket.active) {
      return;
    }

    const themeId = `${baseTheme}-${colorTheme}`;
    if (lastSyncedThemeId.current === themeId) {
      return;
    }

    lastSyncedThemeId.current = themeId;
    setPendingThemeChange(!isSocketAuthenticated(socket));
    socket.emit('user:update-theme', { baseTheme, colorTheme });
  }, [socket, baseTheme, colorTheme]);
}
