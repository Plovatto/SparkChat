import { describe, expect, it } from 'vitest';
import { hasDisplayableLinkPreviewImage, resolveLinkPreviewTarget } from './link-preview-target';

describe('resolveLinkPreviewTarget', () => {
  it('opens an http(s) URL that appears in the message text', () => {
    expect(resolveLinkPreviewTarget('https://site.test/a', 'olha https://site.test/a!')).toBe('https://site.test/a');
    expect(resolveLinkPreviewTarget('http://site.test', 'http://site.test')).toBe('http://site.test');
  });

  it('refuses a URL that is not in the message text', () => {
    expect(resolveLinkPreviewTarget('https://phishing.test', 'olha https://site.test')).toBeNull();
  });

  it('refuses non-http protocols even when they appear in the text', () => {
    expect(resolveLinkPreviewTarget('javascript:alert(1)', 'javascript:alert(1)')).toBeNull();
    expect(resolveLinkPreviewTarget('data:text/html,hi', 'data:text/html,hi')).toBeNull();
  });

  it('refuses empty or malformed URLs', () => {
    expect(resolveLinkPreviewTarget('', 'qualquer texto')).toBeNull();
    expect(resolveLinkPreviewTarget('https://', 'https://')).toBeNull();
  });
});

describe('hasDisplayableLinkPreviewImage', () => {
  it('only accepts locally decrypted blob URLs', () => {
    expect(hasDisplayableLinkPreviewImage('blob:https://app.test/1')).toBe(true);
    expect(hasDisplayableLinkPreviewImage('https://tracker.test/pixel.png')).toBe(false);
    expect(hasDisplayableLinkPreviewImage(null)).toBe(false);
  });
});
