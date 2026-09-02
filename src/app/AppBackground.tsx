import type { PropsWithChildren } from 'react';
import { useTheme } from '@features/theme';

export function AppBackground({ children }: PropsWithChildren) {
  const { theme } = useTheme();

  return (
    <div
      className="app-background"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: theme.headerGradient,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.2)',
          backdropFilter: 'blur(2px)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, width: '100%' }}>{children}</div>
    </div>
  );
}
