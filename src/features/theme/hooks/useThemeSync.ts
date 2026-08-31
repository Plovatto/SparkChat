import { useEffect, useRef } from 'react';
import type { User } from '@features/auth';
import { useSocket } from '@lib/socket';
import { useTheme } from '../theme-context';

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

    if (user.theme) {
      const themeId = `${user.theme.baseTheme}-${user.theme.colorTheme}`;
      lastSyncedThemeId.current = themeId;
      changeTheme(themeId);
    }
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
