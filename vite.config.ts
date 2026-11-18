import { build, defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import react from '@vitejs/plugin-react';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import postcss, { type AtRule, type Root } from 'postcss';
import enLanding from './src/locales/en/landing.json';
import ptLanding from './src/locales/pt/landing.json';
import { languageFromPath, LANGUAGES, type Language } from './src/lib/i18n/language';
import { landingBootScript } from './src/features/landing/lib/boot-script';
import { LANDING_BOOT_PLACEHOLDER, renderLandingDocument, type LandingHeadCopy } from './src/features/landing/lib/landing-head';
import { buildContentSecurityPolicy, contentSecurityPolicyMetaTag } from './src/config/content-security-policy';

const LANDING_SERVER_ENTRY = 'src/features/landing/entry-server.tsx';
const LANDING_ROOT_PLACEHOLDER = '<div id="root"></div>';
const LANDING_THEME_PLACEHOLDER = '<style id="sc-landing-theme"></style>';
const CHARSET_META = '<meta charset="UTF-8" />';
const LANDING_BOOT_SCRIPT = landingBootScript();
const LANDING_BOOT_SCRIPT_HASH = `sha256-${createHash('sha256').update(LANDING_BOOT_SCRIPT).digest('base64')}`;

const LANDING_COPY: Record<Language, LandingHeadCopy> = { pt: ptLanding, en: enLanding };
const LANDING_OUTPUT: Record<Language, string> = { pt: 'index.html', en: 'en/index.html' };

interface LandingRenderer {
  render: (language: Language) => { html: string; themeCss: string };
}

const BOOTSTRAP_CSS_PATH = /[\\/]bootstrap[\\/]dist[\\/]css[\\/]bootstrap\.min\.css$/;
const CLASS_SELECTOR_PATTERN = /\.(-?[_a-zA-Z][\w-]*)/g;

const USED_BOOTSTRAP_CLASSES = new Set([
  'container',
  'container-fluid',
  'row',
  'col-12',
  'col-md-5',
  'col-md-7',
  'col-lg-4',
  'col-lg-8',
  'card',
  'card-body',
  'form-label',
  'form-text',
  'text-center',
]);

function selectorCanMatch(selector: string): boolean {
  for (const match of selector.matchAll(CLASS_SELECTOR_PATTERN)) {
    if (!USED_BOOTSTRAP_CLASSES.has(match[1] ?? '')) {
      return false;
    }
  }
  return true;
}

function removeEmptyAtRules(root: Root): void {
  let removed = true;
  while (removed) {
    removed = false;
    root.walkAtRules((atRule: AtRule) => {
      if (atRule.nodes && atRule.nodes.length === 0) {
        atRule.remove();
        removed = true;
      }
    });
  }
}

function pruneUnusedBootstrapCss(): Plugin {
  return {
    name: 'sparkchat:prune-unused-bootstrap-css',
    enforce: 'pre',
    transform(code, id) {
      const filePath = id.split('?')[0] ?? id;
      if (!BOOTSTRAP_CSS_PATH.test(filePath)) {
        return null;
      }

      const root = postcss.parse(code, { from: filePath });
      root.walkRules((rule) => {
        if (!rule.selectors.some(selectorCanMatch)) {
          rule.remove();
        }
      });
      removeEmptyAtRules(root);

      return { code: root.toString(), map: null };
    },
  };
}

function injectContentSecurityPolicy(html: string, env: Record<string, string>, scriptHashes: string[]): string {
  if (!html.includes(CHARSET_META)) {
    throw new Error('HTML entry is missing its charset meta tag');
  }
  const policy = buildContentSecurityPolicy({
    apiUrl: env.VITE_API_URL,
    socketUrl: env.VITE_SOCKET_URL,
    mediaOrigin: env.VITE_MEDIA_ORIGIN,
    translationModelsUrl: env.VITE_TRANSLATION_MODELS_URL,
    scriptHashes,
  });
  return html.replace(CHARSET_META, () => `${CHARSET_META}
    ${contentSecurityPolicyMetaTag(policy)}`);
}

function landingDocument(): Plugin {
  let env: Record<string, string> = {};

  return {
    name: 'sparkchat:landing-document',
    configResolved(config) {
      env = config.env;
      const isProductionApi = (env.VITE_API_URL ?? '').startsWith('https://');
      if (config.command === 'build' && !config.build.ssr && isProductionApi && !env.VITE_MEDIA_ORIGIN) {
        throw new Error('VITE_MEDIA_ORIGIN must be set when building against an https API');
      }
    },
    transformIndexHtml(html, context) {
      const isLanding = html.includes(LANDING_BOOT_PLACEHOLDER);
      const withBoot = isLanding ? html.replace(LANDING_BOOT_PLACEHOLDER, () => `<script>${LANDING_BOOT_SCRIPT}</script>`) : html;
      if (!context.server) {
        return injectContentSecurityPolicy(withBoot, env, isLanding ? [LANDING_BOOT_SCRIPT_HASH] : []);
      }
      if (!isLanding) {
        return html;
      }
      const language = languageFromPath(context.originalUrl ?? context.path);
      return renderLandingDocument(withBoot, language, LANDING_COPY[language]);
    },
  };
}

function prerenderLanding(): Plugin {
  let root = process.cwd();
  let outDir = path.resolve(root, 'dist');

  return {
    name: 'sparkchat:prerender-landing',
    apply: (_config, { command, isSsrBuild }) => command === 'build' && !isSsrBuild,
    configResolved(config) {
      root = config.root;
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const ssrOutDir = path.resolve(root, 'node_modules/.sparkchat-prerender');

      await build({
        configFile: path.resolve(root, 'vite.config.ts'),
        logLevel: 'warn',
        build: { ssr: LANDING_SERVER_ENTRY, outDir: ssrOutDir, emptyOutDir: true },
      });

      const entryUrl = pathToFileURL(path.join(ssrOutDir, 'entry-server.js')).href;
      const { render } = (await import(entryUrl)) as LandingRenderer;

      const template = await readFile(path.join(outDir, 'index.html'), 'utf8');
      if (!template.includes(LANDING_ROOT_PLACEHOLDER) || !template.includes(LANDING_THEME_PLACEHOLDER)) {
        throw new Error('Landing template placeholders not found in dist/index.html');
      }

      for (const language of LANGUAGES) {
        const rendered = render(language);
        const html = renderLandingDocument(template, language, LANDING_COPY[language])
          .replace(LANDING_ROOT_PLACEHOLDER, () => `<div id="root">${rendered.html}</div>`)
          .replace(LANDING_THEME_PLACEHOLDER, () => `<style id="sc-landing-theme">${rendered.themeCss}</style>`);

        if (!html.includes('<h1')) {
          throw new Error(`Prerendered ${language} landing is missing its main heading`);
        }

        const outputPath = path.join(outDir, LANDING_OUTPUT[language]);
        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, html);
      }

      await rm(ssrOutDir, { recursive: true, force: true });
    },
  };
}

export default defineConfig(({ isSsrBuild }) => ({
  build: isSsrBuild
    ? {}
    : {
        rollupOptions: {
          input: {
            main: path.resolve(import.meta.dirname, 'index.html'),
            app: path.resolve(import.meta.dirname, 'app/index.html'),
          },
        },
      },
  plugins: [pruneUnusedBootstrapCss(), react(), landingDocument(), prerenderLanding()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@app': path.resolve(import.meta.dirname, 'src/app'),
      '@features': path.resolve(import.meta.dirname, 'src/features'),
      '@components': path.resolve(import.meta.dirname, 'src/components'),
      '@hooks': path.resolve(import.meta.dirname, 'src/hooks'),
      '@lib': path.resolve(import.meta.dirname, 'src/lib'),
      '@constants': path.resolve(import.meta.dirname, 'src/constants'),
      '@config': path.resolve(import.meta.dirname, 'src/config'),
    },
  },
  server: {
    port: 5173,
  },
}));
