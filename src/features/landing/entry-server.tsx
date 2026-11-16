import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import type { Language } from '@lib/i18n';
import { buildTheme } from '@features/theme/build-theme';
import { themeTokensToCssVars } from '@features/theme/theme-css-vars';
import { createLandingI18n } from './i18n';
import { Landing } from './Landing';
import { DEFAULT_LANDING_THEME } from './lib/landing-theme-storage';

export interface PrerenderedLanding {
  html: string;
  themeCss: string;
}

export function render(language: Language): PrerenderedLanding {
  const tokens = buildTheme(DEFAULT_LANDING_THEME.base, DEFAULT_LANDING_THEME.color).tokens;
  const declarations = Object.entries(themeTokensToCssVars(tokens))
    .map(([name, value]) => `${name}:${value}`)
    .join(';');

  return {
    html: renderToString(
      <StrictMode>
        <I18nextProvider i18n={createLandingI18n(language)}>
          <Landing />
        </I18nextProvider>
      </StrictMode>,
    ),
    themeCss: `:root{${declarations};color-scheme:${tokens.kind}}`,
  };
}
