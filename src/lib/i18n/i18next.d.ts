import 'i18next';
import type landing from '@/locales/pt/landing.json';
import type themes from '@/locales/pt/themes.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'landing';
    resources: {
      landing: typeof landing;
      themes: typeof themes;
    };
  }
}
