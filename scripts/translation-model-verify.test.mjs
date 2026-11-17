import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { sha256, verifyModelFile } from './translation-model-verify.mjs';

const raw = Buffer.from('model bytes '.repeat(100));
const gz = gzipSync(raw);
const entry = { size: gz.length, sha256: sha256(gz), rawSize: raw.length, rawSha256: sha256(raw) };

describe('verifyModelFile', () => {
  it('accepts a file whose compressed and raw hashes match', () => {
    expect(verifyModelFile(gz, entry)).toBeNull();
  });

  it('rejects compressed size or hash mismatches', () => {
    expect(verifyModelFile(gz.subarray(1), entry)).toBe('size mismatch');
    expect(verifyModelFile(gz, { ...entry, sha256: 'ab'.repeat(32) })).toBe('sha256 mismatch');
  });

  it('rejects a raw size or hash mismatch after gunzip', () => {
    expect(verifyModelFile(gz, { ...entry, rawSize: raw.length + 1 })).toBe('raw size mismatch');
    expect(verifyModelFile(gz, { ...entry, rawSha256: 'cd'.repeat(32) })).toBe('raw sha256 mismatch');
  });

  it('rejects bytes that are not gzip', () => {
    expect(verifyModelFile(raw, { ...entry, size: raw.length, sha256: sha256(raw) })).toBe('not a valid gzip file');
  });

  it('pins raw values for every manifest entry', () => {
    const manifest = JSON.parse(readFileSync(new URL('./translation-models.manifest.json', import.meta.url), 'utf8'));
    for (const files of Object.values(manifest.pairs)) {
      for (const file of Object.values(files)) {
        expect(file.rawSize).toBeGreaterThan(file.size);
        expect(file.rawSha256).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });
});
