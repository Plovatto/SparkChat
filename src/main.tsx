import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@lib/i18n/app-i18n';
import { App } from '@app/App';
import { AppProvider } from '@app/provider';
import { installInviteFragmentCapture } from '@app/invite-fragment';
import { startPwa } from '@features/pwa';
import { restoreThemeColorMeta } from '@features/theme/theme-css-vars';
import { refuseFraming } from '@lib/frame-guard';

import 'bootstrap/dist/css/bootstrap.min.css';
import '@/styles/globals.css';
import '@/styles/theme.css';
import '@/styles/cursor.css';
import '@/styles/motion.css';
import '@/styles/reactions.css';
import '@/styles/responsive.css';

function boot(): void {
  restoreThemeColorMeta();
  installInviteFragmentCapture();
  startPwa();

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
}

if (!refuseFraming(window)) {
  boot();
}
