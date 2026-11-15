import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Landing } from './Landing';

import '@/styles/motion.css';
import '@/styles/theme.css';
import './styles/landing.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

const app = (
  <StrictMode>
    <Landing />
  </StrictMode>
);

if (rootElement.hasChildNodes()) {
  hydrateRoot(rootElement, app);
} else {
  createRoot(rootElement).render(app);
}
