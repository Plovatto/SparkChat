import { build, defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import postcss, { type AtRule, type Root } from 'postcss';

const LANDING_SERVER_ENTRY = 'src/features/landing/entry-server.tsx';
const LANDING_ROOT_PLACEHOLDER = '<div id="root"></div>';
const LANDING_THEME_PLACEHOLDER = '<style id="sc-landing-theme"></style>';

interface LandingRenderer {
  render: () => { html: string; themeCss: string };
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
      const rendered = render();

      const indexPath = path.join(outDir, 'index.html');
      const template = await readFile(indexPath, 'utf8');
      if (!template.includes(LANDING_ROOT_PLACEHOLDER) || !template.includes(LANDING_THEME_PLACEHOLDER)) {
        throw new Error('Landing template placeholders not found in dist/index.html');
      }

      const html = template
        .replace(LANDING_ROOT_PLACEHOLDER, `<div id="root">${rendered.html}</div>`)
        .replace(LANDING_THEME_PLACEHOLDER, `<style id="sc-landing-theme">${rendered.themeCss}</style>`);

      if (!html.includes('<h1')) {
        throw new Error('Prerendered landing is missing its main heading');
      }

      await writeFile(indexPath, html);
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
  plugins: [pruneUnusedBootstrapCss(), react(), prerenderLanding()],
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
