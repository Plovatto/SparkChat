import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { toLocalMediaUrl } from './safe-media-url';

describe('toLocalMediaUrl', () => {
  it('accepts blob urls', () => {
    expect(toLocalMediaUrl('blob:https://plovatto.github.io/3f1b2c')).toBe('blob:https://plovatto.github.io/3f1b2c');
  });

  it('never auto-loads remote, script, data or relative urls', () => {
    expect(toLocalMediaUrl('https://cdn.test/uploads/files/abc.pdf?e2e=1')).toBeUndefined();
    expect(toLocalMediaUrl('https://cdn.test/uploads/images/abc.png')).toBeUndefined();
    expect(toLocalMediaUrl('javascript:/uploads/files/abc.pdf')).toBeUndefined();
    expect(toLocalMediaUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(toLocalMediaUrl('http://cdn.test/uploads/files/abc.pdf')).toBeUndefined();
    expect(toLocalMediaUrl('/uploads/files/abc.pdf')).toBeUndefined();
    expect(toLocalMediaUrl('')).toBeUndefined();
    expect(toLocalMediaUrl(null)).toBeUndefined();
  });

  it('rejects every https url', () => {
    fc.assert(
      fc.property(fc.webUrl({ validSchemes: ['https'], withQueryParameters: true, withFragments: true }), (url) => {
        expect(toLocalMediaUrl(url)).toBeUndefined();
      }),
    );
  });

  it('never returns a url with a protocol other than blob', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = toLocalMediaUrl(input);
        if (result !== undefined) {
          expect(new URL(result).protocol).toBe('blob:');
        }
      }),
    );
  });
});
