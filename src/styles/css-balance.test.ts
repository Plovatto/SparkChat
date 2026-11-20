import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return cssFiles(path);
    }
    return name.endsWith('.css') ? [path] : [];
  });
}

function braceDepths(source: string): { final: number; lowest: number } {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
  let depth = 0;
  let lowest = 0;
  for (const char of text) {
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      lowest = Math.min(lowest, depth);
    }
  }
  return { final: depth, lowest };
}

describe('stylesheets', () => {
  it('have balanced braces so one broken rule cannot swallow the rest of the bundle', () => {
    const files = cssFiles(join(process.cwd(), 'src'));
    expect(files.length).toBeGreaterThan(0);
    const broken = files.filter((file) => {
      const { final, lowest } = braceDepths(readFileSync(file, 'utf8'));
      return final !== 0 || lowest < 0;
    });
    expect(broken).toEqual([]);
  });
});
