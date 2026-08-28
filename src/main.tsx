import AOS from 'aos';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@app/App';
import { AppProvider } from '@app/provider';

import 'bootstrap/dist/css/bootstrap.min.css';
import 'animate.css';
import 'aos/dist/aos.css';
import '@/styles/globals.css';
import '@/styles/animations.css';

AOS.init({
  duration: 600,
  easing: 'ease-out-cubic',
  once: false,
  mirror: true,
  offset: 50,
  delay: 0,
});

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
