import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WORKER_DEPENDENCIES } from './worker-dependencies';

const root = join(process.cwd(), 'src');
const WORKER_FILE = /\.(worker|worklet)\.ts$/;
const BARE_IMPORT = /(?:^|\n)\s*(?:import|export)\s(?!type\s)(?:[^'";]*?\sfrom\s+)?['"]([^'"./][^'"]*)['"]|import\(\s*['"]([^'"./][^'"]*)['"]\s*\)/g;
const ALIASES = ['@/', '@app/', '@features/', '@components/', '@hooks/', '@lib/', '@constants/', '@config/'];

function workerFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return workerFiles(full);
    }
    return WORKER_FILE.test(entry.name) && !entry.name.includes('.test.') ? [full] : [];
  });
}

function bareImports(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(BARE_IMPORT)].map((match) => (match[1] ?? match[2] ?? '').split('?')[0] ?? '').filter((name) => name && !ALIASES.some((alias) => name.startsWith(alias)));
}

describe('worker dependency pre-bundling', () => {
  it('finds the worker and worklet entry files', () => {
    expect(workerFiles(root).length).toBeGreaterThan(0);
  });

  it('pre-bundles every package a worker or worklet imports so the dev server never reloads mid-session', () => {
    const imported = [...new Set(workerFiles(root).flatMap(bareImports))].sort();
    expect(imported.length).toBeGreaterThan(0);
    expect(imported.filter((name) => !WORKER_DEPENDENCIES.includes(name))).toEqual([]);
  });

  it('lists only packages a worker or worklet still imports', () => {
    const imported = new Set(workerFiles(root).flatMap(bareImports));
    expect(WORKER_DEPENDENCIES.filter((name) => !imported.has(name))).toEqual([]);
  });
});
