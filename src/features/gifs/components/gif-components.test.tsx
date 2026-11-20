import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GifItem } from '@lib/api/gifs';
import { gifMediaCache } from '../utils/gif-media-cache';
import { gifLocaleFor } from '../utils/gif-locale';
import { GifButton } from './GifButton';
import { GifPanel, KLIPY_ATTRIBUTION, KLIPY_SEARCH_PLACEHOLDER } from './GifPanel';
import { GifTile } from './GifTile';

vi.mock('@config/env', () => ({ env: { apiUrl: 'https://api.test' } }));
vi.mock('@lib/i18n/app-i18n', () => ({ translate: (key: string) => key, hasTranslation: () => false }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@features/theme', () => ({
  useTheme: () => ({ theme: new Proxy({}, { get: () => '#123456' }) }),
}));

const AUTH = { userId: 'user-1', sessionToken: 'token' };
const ITEM: GifItem = { id: '42', title: 'Happy cat', url: 'https://static.klipy.com/ii/abcdefgh/1/2/happycat.webp', width: 200, height: 100, size: 1000 };

function renderTile(item: GifItem = ITEM): string {
  return renderToStaticMarkup(
    <GifTile
      item={item}
      index={0}
      auth={AUTH}
      scrollRoot={null}
      isFocusTarget
      onPick={() => undefined}
      onKeyNavigate={() => undefined}
      registerTile={() => undefined}
    />,
  );
}

afterEach(() => {
  gifMediaCache.clear();
  vi.restoreAllMocks();
});

describe('GifPanel', () => {
  it('renders the literal KLIPY search placeholder and the KLIPY attribution in any language', () => {
    for (const locale of ['br', 'us'] as const) {
      const html = renderToStaticMarkup(<GifPanel auth={AUTH} locale={locale} onPick={() => undefined} onClose={() => undefined} />);

      expect(KLIPY_SEARCH_PLACEHOLDER).toBe('Search KLIPY');
      expect(KLIPY_ATTRIBUTION).toBe('Powered by KLIPY');
      expect(html).toContain('placeholder="Search KLIPY"');
      expect(html).toContain('data-testid="gif-attribution"');
      expect(html).toContain('>Powered by KLIPY<');
    }
  });

  it('is an accessible dialog that starts loading popular gifs', () => {
    const html = renderToStaticMarkup(<GifPanel auth={AUTH} locale="br" onPick={() => undefined} onClose={() => undefined} />);

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="gifs.panelLabel"');
    expect(html).toContain('aria-label="gifs.searchLabel"');
    expect(html).toContain('maxLength="100"');
    expect(html).toContain('data-testid="gif-loading"');
  });
});

describe('GifTile', () => {
  it('enters with a staggered tile animation and marks the picked gif', () => {
    const html = renderToStaticMarkup(
      <GifTile
        item={ITEM}
        index={27}
        auth={AUTH}
        scrollRoot={null}
        isFocusTarget={false}
        isPicked
        onPick={() => undefined}
        onKeyNavigate={() => undefined}
        registerTile={() => undefined}
      />,
    );

    expect(html).toContain('sc-anim-tile-in sc-stagger');
    expect(html).toContain('--sc-stagger-index:3');
    expect(html).toContain('data-picked="true"');
    expect(html).toContain('sc-gif-tile');
  });

  it('labels each gif with its title and reserves its proportion before loading', () => {
    const html = renderTile();

    expect(html).toContain('aria-label="Happy cat"');
    expect(html).toContain('data-loaded="false"');
    expect(html).toContain('aspect-ratio:1 / 0.5');
    expect(html).not.toContain('<img');
  });

  it('falls back to a generic label for untitled gifs', () => {
    expect(renderTile({ ...ITEM, title: '  ' })).toContain('aria-label="gifs.untitled"');
  });

  it('takes a gif already in the session cache but stays unsendable until it is shown', async () => {
    await gifMediaCache.load(ITEM.url, () => Promise.resolve(new Blob([new TextEncoder().encode('RIFF____WEBPVP8 ')])));

    const html = renderTile();

    expect(html).toContain('data-loaded="true"');
    expect(html).toContain('data-shown="false"');
    expect(html).toContain('aria-disabled="true"');
  });
});

describe('GifPanel motion', () => {
  it('animates in and switches to the exit animation while closing', () => {
    const open = renderToStaticMarkup(<GifPanel auth={AUTH} locale="br" onPick={() => undefined} onClose={() => undefined} />);
    const closing = renderToStaticMarkup(<GifPanel auth={AUTH} locale="br" onPick={() => undefined} onClose={() => undefined} isExiting />);

    expect(open).toContain('sc-gif-panel');
    expect(open).not.toContain('is-exiting');
    expect(closing).toContain('sc-gif-panel is-exiting');
  });
});

describe('GifButton', () => {
  it('is hidden while the gallery is disabled', () => {
    expect(renderToStaticMarkup(<GifButton enabled={false} isOpen={false} onToggle={() => undefined} />)).toBe('');
  });

  it('shows a labelled toggle when the gallery is enabled', () => {
    const html = renderToStaticMarkup(<GifButton enabled isOpen={false} onToggle={() => undefined} />);

    expect(html).toContain('data-testid="gif-button"');
    expect(html).toContain('aria-label="gifs.open"');
    expect(html).toContain('aria-expanded="false"');
  });
});

describe('gifLocaleFor', () => {
  it('asks for brazilian gifs in portuguese and american gifs in english', () => {
    expect(gifLocaleFor('pt')).toBe('br');
    expect(gifLocaleFor('en')).toBe('us');
  });
});
