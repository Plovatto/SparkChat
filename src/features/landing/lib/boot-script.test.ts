import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { landingBootScript } from './boot-script';

interface FakeWindowOptions {
  url: string;
  storage?: Record<string, string>;
  storageThrows?: boolean;
  languages?: string[];
  userAgent?: string;
  navigationType?: string;
}

function createFakeWindow({ url, storage = {}, storageThrows = false, languages = ['pt-BR'], userAgent = 'Mozilla/5.0', navigationType = 'navigate' }: FakeWindowOptions) {
  const parsed = new URL(url);
  const replace = vi.fn<(target: string) => void>();
  const replaceState = vi.fn();
  const setProperty = vi.fn();
  const root = { style: { visibility: '', colorScheme: '', setProperty }, dataset: {} as Record<string, string | undefined> };

  const fake = {
    location: { pathname: parsed.pathname, search: parsed.search, hash: parsed.hash, replace },
    history: { scrollRestoration: 'auto', replaceState },
    navigator: { languages, language: languages[0] ?? '', userAgent },
    document: { documentElement: root },
    performance: { getEntriesByType: () => [{ type: navigationType }] },
    get localStorage() {
      if (storageThrows) {
        throw new Error('blocked');
      }
      return { getItem: (key: string) => storage[key] ?? null };
    },
  };

  return { fake, replace, replaceState, setProperty, root };
}

function boot(options: FakeWindowOptions) {
  const handles = createFakeWindow(options);
  runInNewContext(landingBootScript(), { window: handles.fake, URLSearchParams });
  return handles;
}

describe('landing boot script', () => {
  it('sends a saved session to the app keeping search and hash, even from the English page', () => {
    const { replace, root } = boot({ url: 'https://x.dev/en/?a=1#temas', storage: { 'sparkchat:session': '{}' }, languages: ['en-US'] });
    expect(replace).toHaveBeenCalledWith('/app/?a=1#temas');
    expect(root.style.visibility).toBe('hidden');
  });

  it('forwards join links to the app without a session', () => {
    const { replace } = boot({ url: 'https://x.dev/?join=ABC' });
    expect(replace).toHaveBeenCalledWith('/app/?join=ABC');
  });

  it('keeps a session holder on the landing when presenting', () => {
    const { replace } = boot({ url: 'https://x.dev/?apresentacao', storage: { 'sparkchat:session': '{}' } });
    expect(replace).not.toHaveBeenCalled();
  });

  it('moves an English system to the English page', () => {
    const { replace } = boot({ url: 'https://x.dev/#temas', languages: ['en-GB'] });
    expect(replace).toHaveBeenCalledWith('/en/#temas');
  });

  it('sends unsupported system languages to the English page', () => {
    const { replace } = boot({ url: 'https://x.dev/', languages: ['fr-FR'] });
    expect(replace).toHaveBeenCalledWith('/en/');
  });

  it('honors a saved Portuguese choice over an English system, preserving the query', () => {
    const { replace } = boot({
      url: 'https://x.dev/en/?apresentacao#temas',
      storage: { 'sparkchat:language': 'pt' },
      languages: ['en-US'],
    });
    expect(replace).toHaveBeenCalledWith('/?apresentacao#temas');
  });

  it('stays put when the page already matches the wanted language', () => {
    expect(boot({ url: 'https://x.dev/', languages: ['pt-BR'] }).replace).not.toHaveBeenCalled();
    expect(boot({ url: 'https://x.dev/en/', languages: ['en-US'] }).replace).not.toHaveBeenCalled();
  });

  it('never redirects crawlers', () => {
    const { replace } = boot({ url: 'https://x.dev/', languages: ['en-US'], userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)' });
    expect(replace).not.toHaveBeenCalled();
  });

  it('falls back to the system language when storage is blocked', () => {
    const { replace } = boot({ url: 'https://x.dev/', languages: ['en-US'], storageThrows: true });
    expect(replace).toHaveBeenCalledWith('/en/');
  });

  it('applies the saved landing theme', () => {
    const theme = JSON.stringify({ vars: { '--sc-accent': '#fff' }, kind: 'light' });
    const { setProperty, root } = boot({ url: 'https://x.dev/', storage: { 'sparkchat:landing-theme': theme } });
    expect(setProperty).toHaveBeenCalledWith('--sc-accent', '#fff');
    expect(root.dataset.theme).toBe('light');
  });

  it('drops the hash on reload so the page starts at the top', () => {
    const { replaceState } = boot({ url: 'https://x.dev/#temas', navigationType: 'reload' });
    expect(replaceState).toHaveBeenCalledWith(null, '', '/');
  });
});
