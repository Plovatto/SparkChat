import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import enApp from '../../../locales/en/app.json';
import ptApp from '../../../locales/pt/app.json';

type Tree = { [key: string]: string | Tree };

const language = vi.hoisted(() => ({ current: 'pt' }));

function lookup(tree: Tree, key: string): string {
  const value = key.split('.').reduce<string | Tree | undefined>((node, part) => (typeof node === 'object' ? node[part] : undefined), tree);
  return typeof value === 'string' ? value : key;
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => lookup(language.current === 'pt' ? ptApp : enApp, key) }),
}));

vi.mock('@features/theme', () => ({
  useTheme: () => ({
    theme: new Proxy({}, { get: (_target, property) => String(property) }),
  }),
}));

vi.mock('../styles/key-transparency.css', () => ({}));

const { raiseKtAlert, resetKtAlerts, dismissKtAlert, getActiveKtAlerts } = await import('@lib/kt/kt-alerts');
const { memoryKtStorage } = await import('@lib/kt/kt-test-support');
const { KeyTransparencyBanner } = await import('./KeyTransparencyBanner');
const { pickAlertToShow } = await import('./alert-priority');

beforeEach(() => {
  memoryKtStorage();
  resetKtAlerts();
  language.current = 'pt';
});

afterEach(() => {
  resetKtAlerts();
});

describe('KeyTransparencyBanner', () => {
  it('renders nothing while there is no alert', () => {
    expect(renderToStaticMarkup(<KeyTransparencyBanner />)).toBe('');
  });

  it('shows the Portuguese warning for an unknown key on the account', () => {
    raiseKtAlert('me', 'unknownOwnKey', 'own-key:x');
    const html = renderToStaticMarkup(<KeyTransparencyBanner />);
    expect(html).toContain('Uma chave desconhecida foi registrada na sua conta');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Dispensar');
  });

  it('shows the Portuguese warning for a split view', () => {
    raiseKtAlert('me', 'splitView', 'split-view');
    expect(renderToStaticMarkup(<KeyTransparencyBanner />)).toContain('O servidor está mostrando registros diferentes');
  });

  it('shows the English texts too', () => {
    language.current = 'en';
    raiseKtAlert('me', 'splitView', 'split-view');
    expect(renderToStaticMarkup(<KeyTransparencyBanner />)).toContain('The server is showing different records');
  });

  it('offers to trust a new log only when the pinned key changed and the build does not pin it', () => {
    raiseKtAlert('me', 'logKeyChanged', 'log-key:stored', 'stored');
    expect(renderToStaticMarkup(<KeyTransparencyBanner />)).toContain('Confiar no novo registro');
    resetKtAlerts();
    raiseKtAlert('me', 'logKeyChanged', 'log-key:build', 'build');
    expect(renderToStaticMarkup(<KeyTransparencyBanner />)).not.toContain('Confiar no novo registro');
  });

  it('puts the most serious alert first and hides dismissed ones', () => {
    raiseKtAlert('me', 'keyRejected', 'key-rejected:a');
    raiseKtAlert('me', 'splitView', 'split-view');
    raiseKtAlert('me', 'unknownOwnKey', 'own-key:x');
    expect(pickAlertToShow(getActiveKtAlerts())?.kind).toBe('splitView');
    const first = getActiveKtAlerts().find((alert) => alert.kind === 'splitView');
    dismissKtAlert(first?.id ?? '');
    expect(pickAlertToShow(getActiveKtAlerts())?.kind).toBe('unknownOwnKey');
  });

  it('does not raise the same alert again right after it was dismissed', () => {
    const alert = raiseKtAlert('me', 'splitView', 'split-view');
    dismissKtAlert(alert?.id ?? '');
    expect(raiseKtAlert('me', 'splitView', 'split-view')).toBeNull();
    expect(getActiveKtAlerts()).toEqual([]);
  });

  it('raises it again a day later', () => {
    const alert = raiseKtAlert('me', 'splitView', 'split-view', undefined, 1000);
    dismissKtAlert(alert?.id ?? '', 2000);
    expect(raiseKtAlert('me', 'splitView', 'split-view', undefined, 1000 + 25 * 60 * 60 * 1000)).not.toBeNull();
  });
});
