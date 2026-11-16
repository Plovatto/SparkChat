import 'i18next';
import type app from '@/locales/pt/app.json';
import type landing from '@/locales/pt/landing.json';
import type themes from '@/locales/pt/themes.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'app';
    resources: {
      app: typeof app;
      landing: typeof landing;
      themes: typeof themes;
    };
  }
}
