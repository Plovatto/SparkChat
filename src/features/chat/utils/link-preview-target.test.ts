import { describe, expect, it } from 'vitest';
import { getLinkPreviewHost, hasDisplayableLinkPreviewImage, resolveLinkPreviewTarget } from './link-preview-target';

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

describe('getLinkPreviewHost', () => {
  it('returns the real hostname of an http(s) URL', () => {
    expect(getLinkPreviewHost('https://evil.example/login?x=1')).toBe('evil.example');
    expect(getLinkPreviewHost('http://Sub.Site.test:8080/a')).toBe('sub.site.test');
  });

  it('shows the punycode form of an IDN host so lookalikes stay visible', () => {
    expect(getLinkPreviewHost('https://xn--pple-43d.com/')).toBe('xn--pple-43d.com');
    expect(getLinkPreviewHost('https://аpple.com/')).toBe('xn--pple-43d.com');
  });

  it('refuses malformed URLs and non-http protocols', () => {
    expect(getLinkPreviewHost('not a url')).toBeNull();
    expect(getLinkPreviewHost('javascript:alert(1)')).toBeNull();
    expect(getLinkPreviewHost('')).toBeNull();
  });
});
