import { describe, expect, it } from 'vitest';
import manifest from '../../../../scripts/translation-models.manifest.json';
import { BUNDLED_MODEL_REGISTRY, modelRegistry } from './model-registry';

describe('bundled model registry', () => {
  it('is built from the pinned manifest in the registry.json format', () => {
    expect(BUNDLED_MODEL_REGISTRY.enpt.model).toEqual({
      name: 'enpt/model.enpt.intgemm.alphas.bin.gz',
      size: 23340019,
      expectedSha256Hash: 'afb5ae08a2e40b622cd191584cca1df00721fea43de85cec74191fc180370f08',
    });
    for (const key of ['enpt', 'pten'] as const) {
      for (const part of ['model', 'lex', 'vocab'] as const) {
        const pinned = manifest.pairs[key][part];
        const entry = BUNDLED_MODEL_REGISTRY[key][part];
        expect(entry.name).toBe(`${key}/${pinned.path.split('/').at(-1)}`);
        expect(entry.size).toBe(pinned.size);
        expect(entry.expectedSha256Hash).toMatch(/^[0-9a-f]{64}$/);
        expect(entry.expectedSha256Hash).toBe(pinned.sha256);
      }
    }
    const enptTotal = Object.values(BUNDLED_MODEL_REGISTRY.enpt).reduce((sum, file) => sum + file.size, 0);
    expect(enptTotal).toBe(25866313);
  });

  it('resolves file names against the models base URL', () => {
    const registry = modelRegistry('https://models.example/v1/');
    expect(registry.pten.vocab.name).toBe('https://models.example/v1/pten/vocab.pten.spm.gz');
    expect(registry.pten.vocab.expectedSha256Hash).toBe(BUNDLED_MODEL_REGISTRY.pten.vocab.expectedSha256Hash);
    // the bundled registry itself stays relative
    expect(BUNDLED_MODEL_REGISTRY.pten.vocab.name).toBe('pten/vocab.pten.spm.gz');
  });
});
