import type { PropsWithChildren } from 'react';
import type { ThemeTokens } from '@features/theme';

interface AppBackgroundProps {
  theme: ThemeTokens;
}

export function AppBackground({ theme, children }: PropsWithChildren<AppBackgroundProps>) {
  return (
    <div
      className="app-background"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: theme.gradient,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: theme.kind === 'dark' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.06)',
          backdropFilter: 'blur(2px)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, width: '100%' }}>{children}</div>
    </div>
  );
}
