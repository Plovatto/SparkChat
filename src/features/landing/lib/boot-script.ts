import { LANDING_THEME_STORAGE_KEY, LANGUAGE_STORAGE_KEY, SESSION_STORAGE_KEY } from '../../../constants/storage-keys';
import { CRAWLER_PATTERN, LANGUAGE_PATHS, languageFromPath, resolvePreferredLanguage } from '../../../lib/i18n/language';

export interface LandingBootConfig {
  sessionKey: string;
  themeKey: string;
  languageKey: string;
  appPath: string;
  languagePaths: Record<'pt' | 'en', string>;
  crawlerSource: string;
  crawlerFlags: string;
}

export const LANDING_BOOT_CONFIG: LandingBootConfig = {
  sessionKey: SESSION_STORAGE_KEY,
  themeKey: LANDING_THEME_STORAGE_KEY,
  languageKey: LANGUAGE_STORAGE_KEY,
  appPath: '/app/',
  languagePaths: LANGUAGE_PATHS,
  crawlerSource: CRAWLER_PATTERN.source,
  crawlerFlags: CRAWLER_PATTERN.flags,
};

export function runLandingBoot(
  resolveLanguage: (stored: string | null, system: readonly string[]) => 'pt' | 'en',
  fromPath: (pathname: string) => 'pt' | 'en',
  config: LandingBootConfig,
): void {
  try {
    const { location, history, navigator, document, performance } = window;
    const read = (key: string): string | null => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    };
    const leave = (path: string) => {
      document.documentElement.style.visibility = 'hidden';
      location.replace(path + location.search + location.hash);
    };

    const params = new URLSearchParams(location.search);
    const forwards = params.has('join') || params.has('startChat');
    if (forwards || (read(config.sessionKey) !== null && !params.has('apresentacao'))) {
      leave(config.appPath);
      return;
    }

    if (!new RegExp(config.crawlerSource, config.crawlerFlags).test(navigator.userAgent)) {
      const system = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
      const wanted = resolveLanguage(read(config.languageKey), system);
      if (wanted !== fromPath(location.pathname)) {
        leave(config.languagePaths[wanted]);
        return;
      }
    }

    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (navigation && navigation.type === 'reload' && location.hash) {
      history.replaceState(null, '', location.pathname + location.search);
    }

    const saved = JSON.parse(read(config.themeKey) || 'null') as { vars?: Record<string, string>; kind?: string } | null;
    if (saved && saved.vars) {
      const root = document.documentElement;
      for (const name of Object.keys(saved.vars)) {
        root.style.setProperty(name, saved.vars[name] ?? '');
      }
      root.style.colorScheme = saved.kind ?? '';
      root.dataset.theme = saved.kind;
    }
  } catch {
    return;
  }
}

export function landingBootScript(config: LandingBootConfig = LANDING_BOOT_CONFIG): string {
  const serializedConfig = JSON.stringify(config).replaceAll('<', '\\u003c');
  return `(${runLandingBoot.toString()})(${resolvePreferredLanguage.toString()}, ${languageFromPath.toString()}, ${serializedConfig});`;
}
