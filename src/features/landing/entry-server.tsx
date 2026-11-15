import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { buildTheme } from '@features/theme/build-theme';
import { themeTokensToCssVars } from '@features/theme/theme-css-vars';
import { Landing } from './Landing';
import { DEFAULT_LANDING_THEME } from './lib/landing-theme-storage';

export interface PrerenderedLanding {
  html: string;
  themeCss: string;
}

export function render(): PrerenderedLanding {
  const tokens = buildTheme(DEFAULT_LANDING_THEME.base, DEFAULT_LANDING_THEME.color).tokens;
  const declarations = Object.entries(themeTokensToCssVars(tokens))
    .map(([name, value]) => `${name}:${value}`)
    .join(';');

  return {
    html: renderToString(
      <StrictMode>
        <Landing />
      </StrictMode>,
    ),
    themeCss: `:root{${declarations};color-scheme:${tokens.kind}}`,
  };
}
