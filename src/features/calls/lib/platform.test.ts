import { describe, expect, it } from 'vitest';
import { isAndroidBrowser } from './platform';

describe('isAndroidBrowser', () => {
  it('detects Android user agents only', () => {
    expect(isAndroidBrowser('Mozilla/5.0 (Linux; Android 16; SM-S928B) AppleWebKit/537.36 Chrome/158.0 Mobile Safari/537.36')).toBe(true);
    expect(isAndroidBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/158.0 Safari/537.36')).toBe(false);
    expect(isAndroidBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1')).toBe(false);
    expect(isAndroidBrowser(undefined)).toBe(false);
  });
});
