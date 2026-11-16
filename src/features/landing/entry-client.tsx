import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { languageFromPath } from '@lib/i18n';
import { createLandingI18n } from './i18n';
import { Landing } from './Landing';

import '@/styles/motion.css';
import '@/styles/theme.css';
import './styles/landing.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

const i18n = createLandingI18n(languageFromPath(window.location.pathname));

const app = (
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <Landing />
    </I18nextProvider>
  </StrictMode>
);

if (rootElement.hasChildNodes()) {
  hydrateRoot(rootElement, app);
} else {
  createRoot(rootElement).render(app);
}
