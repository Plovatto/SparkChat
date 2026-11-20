import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const PUBLIC_DIR = path.join(ROOT, 'public');

interface ManifestImage {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
  form_factor?: string;
  label?: string;
}

interface Manifest {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: string;
  display_override?: string[];
  background_color: string;
  theme_color: string;
  icons: ManifestImage[];
  screenshots: ManifestImage[];
  shortcuts: { name: string; url: string; icons: ManifestImage[] }[];
}

const readManifest = (file: string) => JSON.parse(readFileSync(path.join(PUBLIC_DIR, file), 'utf8')) as Manifest & Record<string, unknown>;
const manifest = readManifest('manifest.webmanifest');
const english = readManifest('manifest.en.webmanifest');
const LOCALIZED = new Set(['description', 'lang', 'screenshots', 'shortcuts']);

function pngSize(src: string): string {
  const buffer = readFileSync(path.join(PUBLIC_DIR, src));
  expect(buffer.subarray(1, 4).toString('ascii')).toBe('PNG');
  return `${buffer.readUInt32BE(16)}x${buffer.readUInt32BE(20)}`;
}

describe('web app manifest', () => {
  it('is scoped to the app and separate from the landing page', () => {
    expect(manifest).toMatchObject({ id: '/app/', start_url: '/app/', scope: '/app/', display: 'standalone' });
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
    expect(manifest.name).toBe('SparkChat');
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.description.length).toBeGreaterThan(20);
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('has 192 and 512 icons in both any and maskable purposes with matching files', () => {
    const pngIcons = manifest.icons.filter((icon) => icon.type === 'image/png');
    for (const purpose of ['any', 'maskable']) {
      for (const size of ['192x192', '512x512']) {
        expect(pngIcons.some((icon) => (icon.purpose ?? 'any') === purpose && icon.sizes === size)).toBe(true);
      }
    }
    for (const icon of pngIcons) {
      expect(pngSize(icon.src)).toBe(icon.sizes);
    }
    for (const icon of manifest.icons) {
      expect(existsSync(path.join(PUBLIC_DIR, icon.src))).toBe(true);
    }
  });

  it('has narrow and wide screenshots whose files match their declared size', () => {
    const factors = manifest.screenshots.map((shot) => shot.form_factor);
    expect(factors).toContain('narrow');
    expect(factors).toContain('wide');
    for (const shot of manifest.screenshots) {
      expect(shot.label?.length).toBeGreaterThan(0);
      expect(pngSize(shot.src)).toBe(shot.sizes);
      const [width, height] = shot.sizes.split('x').map(Number);
      expect(shot.form_factor === 'wide' ? width! > height! : height! > width!).toBe(true);
    }
  });

  it('offers the new chat shortcut inside the scope', () => {
    expect(manifest.shortcuts).toHaveLength(1);
    expect(manifest.shortcuts[0]!.name).toBe('Novo chat');
    expect(manifest.shortcuts[0]!.url).toBe('/app/?action=new-chat');
    expect(manifest.shortcuts[0]!.url.startsWith(manifest.scope)).toBe(true);
  });

  it('ships an English variant that is the same installed app with translated text', () => {
    expect(english).toMatchObject({ id: manifest.id, start_url: manifest.start_url, scope: manifest.scope, name: 'SparkChat', lang: 'en' });
    for (const key of new Set([...Object.keys(manifest), ...Object.keys(english)])) {
      if (!LOCALIZED.has(key)) {
        expect(english[key], key).toEqual(manifest[key]);
      }
    }
    expect(manifest.lang).toBe('pt-BR');
    expect(english.description).not.toBe(manifest.description);
    expect(english.shortcuts.map((shortcut) => [shortcut.name, shortcut.url])).toEqual([['New chat', '/app/?action=new-chat']]);
    expect(english.screenshots.map((shot) => shot.src)).toEqual(manifest.screenshots.map((shot) => shot.src));
    for (const [index, shot] of english.screenshots.entries()) {
      expect(shot.label).toBeTruthy();
      expect(shot.label).not.toBe(manifest.screenshots[index]!.label);
    }
  });

  it('ships the notification badge and the offline page without inline scripts', () => {
    expect(pngSize('badge-96.png')).toBe('96x96');
    const offline = readFileSync(path.join(PUBLIC_DIR, 'app/offline.html'), 'utf8');
    expect(offline).not.toMatch(/<script/i);
    expect(offline).toContain('Content-Security-Policy');
    expect(offline).toContain('lang="en"');
  });

  it('is linked from the app entry together with the iOS meta tags', () => {
    const html = readFileSync(path.join(ROOT, 'app/index.html'), 'utf8');
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(html).toContain('name="apple-mobile-web-app-status-bar-style"');
  });
});
