import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { toSafeMediaUrl } from './safe-media-url';

describe('toSafeMediaUrl', () => {
  it('accepts https and blob urls', () => {
    expect(toSafeMediaUrl('https://cdn.test/uploads/files/abc.pdf?e2e=1')).toBe('https://cdn.test/uploads/files/abc.pdf?e2e=1');
    expect(toSafeMediaUrl('blob:https://plovatto.github.io/3f1b2c')).toBe('blob:https://plovatto.github.io/3f1b2c');
  });

  it('rejects script, data, insecure and relative urls', () => {
    expect(toSafeMediaUrl('javascript:/uploads/files/abc.pdf')).toBeNull();
    expect(toSafeMediaUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(toSafeMediaUrl('http://cdn.test/uploads/files/abc.pdf')).toBeNull();
    expect(toSafeMediaUrl('/uploads/files/abc.pdf')).toBeNull();
  });

  it('keeps every https url', () => {
    fc.assert(
      fc.property(fc.webUrl({ validSchemes: ['https'], withQueryParameters: true, withFragments: true }), (url) => {
        expect(toSafeMediaUrl(url)).toBe(new URL(url).href);
      }),
    );
  });

  it('never returns a url with a protocol other than https or blob', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = toSafeMediaUrl(input);
        if (result !== null) {
          expect(['https:', 'blob:']).toContain(new URL(result).protocol);
        }
      }),
    );
  });

  it('rejects any javascript or data url', () => {
    fc.assert(
      fc.property(fc.constantFrom('javascript:', 'JavaScript:', 'data:', ' javascript:'), fc.string(), (scheme, rest) => {
        expect(toSafeMediaUrl(scheme + rest)).toBeNull();
      }),
    );
  });
});
