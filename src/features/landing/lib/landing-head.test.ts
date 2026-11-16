import { describe, expect, it } from 'vitest';
import en from '@/locales/en/landing.json';
import pt from '@/locales/pt/landing.json';
import { LANDING_HEAD_PLACEHOLDER, landingStructuredData, renderLandingDocument } from './landing-head';

const TEMPLATE = `<!doctype html>\n<html lang="pt-BR">\n  <head>\n    ${LANDING_HEAD_PLACEHOLDER}\n  </head>\n</html>`;

describe('renderLandingDocument', () => {
  it('renders the Portuguese page at the root', () => {
    const html = renderLandingDocument(TEMPLATE, 'pt', pt);
    expect(html).toContain('<html lang="pt-BR">');
    expect(html).toContain(`<title>${pt.meta.title}</title>`);
    expect(html).toContain('<link rel="canonical" href="https://sparkchat.plovatto.dev/" />');
    expect(html).toContain('<meta property="og:locale" content="pt_BR" />');
    expect(html).toContain('<meta property="og:locale:alternate" content="en_US" />');
  });

  it('renders the English page under /en/', () => {
    const html = renderLandingDocument(TEMPLATE, 'en', en);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain(`<title>${en.meta.title}</title>`);
    expect(html).toContain('<link rel="canonical" href="https://sparkchat.plovatto.dev/en/" />');
    expect(html).toContain('<meta property="og:locale" content="en_US" />');
  });

  it('links both languages and points x-default to English', () => {
    const html = renderLandingDocument(TEMPLATE, 'pt', pt);
    expect(html).toContain('<link rel="alternate" hreflang="pt-BR" href="https://sparkchat.plovatto.dev/" />');
    expect(html).toContain('<link rel="alternate" hreflang="en" href="https://sparkchat.plovatto.dev/en/" />');
    expect(html).toContain('<link rel="alternate" hreflang="x-default" href="https://sparkchat.plovatto.dev/en/" />');
  });

  it('escapes quotes and markup in translated values', () => {
    const copy = { meta: { ...pt.meta, description: 'Say "hi" <b>now</b>' } };
    const html = renderLandingDocument(TEMPLATE, 'pt', copy);
    expect(html).toContain('content="Say &quot;hi&quot; &lt;b&gt;now&lt;/b&gt;"');
    expect(html).not.toContain('<b>now</b>');
  });

  it('fails loudly when the template lost its placeholder', () => {
    expect(() => renderLandingDocument('<html lang="pt-BR"></html>', 'pt', pt)).toThrow(/sc-landing-head/);
  });
});

describe('landingStructuredData', () => {
  it('describes the app in the page language', () => {
    const app = landingStructuredData('en', en)['@graph'][1];
    expect(app).toMatchObject({ inLanguage: 'en', url: 'https://sparkchat.plovatto.dev/en/' });
    expect(app?.featureList).toContain(en.meta.featureList.realtime);
  });
});
