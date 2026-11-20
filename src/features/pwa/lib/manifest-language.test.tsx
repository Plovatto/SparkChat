import { describe, expect, it } from 'vitest';
import { applyManifestLanguage, manifestHrefFor } from './manifest-language';

function page(head = ''): Document {
  return new DOMParser().parseFromString(`<!doctype html><html><head>${head}</head><body></body></html>`, 'text/html');
}

describe('manifest language', () => {
  it('maps English to the English manifest and everything else to the Portuguese default', () => {
    expect(manifestHrefFor('en')).toBe('/manifest.en.webmanifest');
    expect(manifestHrefFor('pt')).toBe('/manifest.webmanifest');
    expect(manifestHrefFor(null)).toBe('/manifest.webmanifest');
  });

  it('switches the existing manifest link in place when the language changes', () => {
    const doc = page('<link rel="manifest" href="/manifest.webmanifest" />');
    applyManifestLanguage(doc, 'en');
    const links = doc.head.querySelectorAll('link[rel="manifest"]');
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute('href')).toBe('/manifest.en.webmanifest');
    applyManifestLanguage(doc, 'pt');
    expect(doc.head.querySelector('link[rel="manifest"]')!.getAttribute('href')).toBe('/manifest.webmanifest');
  });

  it('adds the link when the page has none', () => {
    const doc = page();
    applyManifestLanguage(doc, 'en');
    expect(doc.head.querySelector('link[rel="manifest"]')!.getAttribute('href')).toBe('/manifest.en.webmanifest');
  });
});
