import type { CSSProperties, PropsWithChildren } from 'react';
import type { ThemeTokens } from '@features/theme';

interface AppBackgroundProps {
  theme: ThemeTokens;
}

export function AppBackground({ theme, children }: PropsWithChildren<AppBackgroundProps>) {
  const style = {
    background: theme.pageGradient,
    '--bg-orb-a': theme.accent,
    '--bg-orb-b': theme.accentSecondary,
    '--bg-orb-opacity': theme.kind === 'dark' ? '0.42' : '0.3',
    '--bg-veil': theme.kind === 'dark' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.06)',
  } as CSSProperties;

  return (
    <div className="app-background" style={style}>
      <div className="app-background__fx" aria-hidden="true">
        <span className="app-background__orb app-background__orb--a" />
        <span className="app-background__orb app-background__orb--b" />
        <span className="app-background__orb app-background__orb--c" />
      </div>

      <div className="app-background__content">{children}</div>
    </div>
  );
}
