import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = join(process.cwd(), 'src', 'features', 'calls', 'styles');

function rules(): Array<{ file: string; selector: string; body: string }> {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.css'))
    .flatMap((file) => {
      const text = readFileSync(join(dir, file), 'utf8');
      return [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({ file, selector: (match[1] ?? '').trim(), body: match[2] ?? '' }));
    });
}

describe('call video fit', () => {
  it('never crops call video with object-fit cover', () => {
    const cropped = rules().filter((rule) => /video/.test(rule.selector) && /object-fit:\s*cover/.test(rule.body));
    expect(cropped.map((rule) => `${rule.file}: ${rule.selector}`)).toEqual([]);
  });

  it('keeps the camera surfaces on contain', () => {
    const all = rules();
    for (const selector of ['.sc-call-self-video', '.sc-call-feed__video', '.sc-call-tile video']) {
      const rule = all.find((candidate) => candidate.selector === selector);
      expect(rule?.body, selector).toMatch(/object-fit:\s*contain/);
    }
  });

  it('does not mirror the self view unconditionally', () => {
    const self = rules().find((rule) => rule.selector === '.sc-call-self-video');
    expect(self?.body).not.toMatch(/scaleX\(-1\)/);
  });
});
