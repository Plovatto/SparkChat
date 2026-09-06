import { useEffect, useRef } from 'react';
import type { User } from '@features/auth';
import { useSocket } from '@lib/socket';
import { useTheme } from '../theme-context';
import { hasStoredThemePreference } from '../theme-guards';

export function useThemeSync(user: User | null): void {
  const { socket } = useSocket();
  const { baseTheme, colorTheme, changeTheme } = useTheme();
  const lastSyncedThemeId = useRef<string | null>(null);
  const hasResolvedServerTheme = useRef(false);
  const localThemeRef = useRef({ socket, baseTheme, colorTheme });
  localThemeRef.current = { socket, baseTheme, colorTheme };

  useEffect(() => {
    if (!user) {
      return;
    }

    hasResolvedServerTheme.current = true;

    if (!user.theme) {
      return;
    }

    const { socket: currentSocket, baseTheme: localBase, colorTheme: localColor } = localThemeRef.current;
    const serverThemeId = `${user.theme.baseTheme}-${user.theme.colorTheme}`;
    const localThemeId = `${localBase}-${localColor}`;

    if (localThemeId === serverThemeId) {
      lastSyncedThemeId.current = serverThemeId;
      return;
    }

    if (hasStoredThemePreference()) {
      lastSyncedThemeId.current = localThemeId;
      currentSocket?.emit('user:update-theme', { baseTheme: localBase, colorTheme: localColor });
      return;
    }

    lastSyncedThemeId.current = serverThemeId;
    changeTheme(serverThemeId);
  }, [user, changeTheme]);

  useEffect(() => {
    if (!socket || !hasResolvedServerTheme.current) {
      return;
    }

    const themeId = `${baseTheme}-${colorTheme}`;
    if (lastSyncedThemeId.current === themeId) {
      return;
    }

    lastSyncedThemeId.current = themeId;
    socket.emit('user:update-theme', { baseTheme, colorTheme });
  }, [socket, baseTheme, colorTheme]);
}
