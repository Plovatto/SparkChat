import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('look catalog', () => {
  it('matches what the export script generates', () => {
    const generated = execFileSync(
      process.execPath,
      ['--experimental-strip-types', '--no-warnings', resolve(process.cwd(), 'scripts/export-assistant-catalog.mjs'), '--stdout'],
      { encoding: 'utf8' },
    );
    const committed = readFileSync(resolve(process.cwd(), 'src/features/assistant/look-catalog.json'), 'utf8');
    expect(committed).toBe(generated);
  }, 20000);
});
