import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import postcss, { type AtRule, type Root } from 'postcss';

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

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/SparkChat/' : '/',
  plugins: [pruneUnusedBootstrapCss(), react()],
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
