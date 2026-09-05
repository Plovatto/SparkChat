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

  useEffect(() => {
    if (!user) {
      return;
    }

    hasResolvedServerTheme.current = true;

    if (!user.theme) {
      return;
    }

    const serverThemeId = `${user.theme.baseTheme}-${user.theme.colorTheme}`;
    const localThemeId = `${baseTheme}-${colorTheme}`;

    if (localThemeId === serverThemeId) {
      lastSyncedThemeId.current = serverThemeId;
      return;
    }

    if (hasStoredThemePreference()) {
      lastSyncedThemeId.current = localThemeId;
      socket?.emit('user:update-theme', { baseTheme, colorTheme });
      return;
    }

    lastSyncedThemeId.current = serverThemeId;
    changeTheme(serverThemeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, user?.theme?.baseTheme, user?.theme?.colorTheme, changeTheme]);

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
