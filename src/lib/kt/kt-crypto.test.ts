import { beforeAll, describe, expect, it } from 'vitest';
import { getSodium } from '@lib/e2ee/sodium';
import {
  decodeProof,
  isSignedTreeHead,
  leafHash,
  leafIdOf,
  verifyConsistency,
  verifyHeadSignature,
  verifyInclusion,
  type Sodium,
} from './kt-crypto';
import { FakeLog, newLogKeys, type FakeLeaf } from './kt-test-support';

let sodium: Sodium;

beforeAll(async () => {
  sodium = await getSodium();
});

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (text: string) => Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16));

function rfcLeaf(data: string): Uint8Array {
  const body = fromHex(data);
  const joined = new Uint8Array(body.length + 1);
  joined.set(body, 1);
  return sodium.crypto_hash_sha256(joined);
}

describe('RFC 6962 known answers', () => {
  const ROOT_8 = '5dc9da79a70659a9ad559cb701ded9a2ab9d823aad2f4960cfe370eff4604328';
  const ROOT_6 = '76e67dadbcdf1e10e1b74ddc608abd2f98dfb16fbce75277b5232a127f2087ef';

  it('verifies the published inclusion proof for the first leaf of an eight leaf tree', () => {
    const proof = [
      '96a296d224f285c67bee93c30f8a309157f0daa35dc5b87e410b78630a09cfc7',
      '5f083f0a1a33ca076a95279832580db3e0ef4584bdff1f54c8a360f50de3031e',
      '6b47aaf29ee3c2af9af889bc1fb9254dabd31177f16232dd6aab035ca39bf6e4',
    ].map(fromHex);
    expect(verifyInclusion(sodium, rfcLeaf(''), 0, 8, proof, fromHex(ROOT_8))).toBe(true);
    expect(verifyInclusion(sodium, rfcLeaf('00'), 0, 8, proof, fromHex(ROOT_8))).toBe(false);
    expect(verifyInclusion(sodium, rfcLeaf(''), 1, 8, proof, fromHex(ROOT_8))).toBe(false);
  });

  it('verifies the published consistency proof between sizes 6 and 8', () => {
    const proof = [
      '0ebc5d3437fbe2db158b9f126a1d118e308181031d0a949f8dededebc558ef6a',
      'ca854ea128ed050b41b35ffc1b87b8eb2bde461e9e3b5596ece6b9d5975a0ae0',
      'd37ee418976dd95753c1c73862b9398fa2a2cf9b4ff0fdfe8b30cd95209614b7',
    ].map(fromHex);
    expect(verifyConsistency(sodium, 6, 8, fromHex(ROOT_6), fromHex(ROOT_8), proof)).toBe(true);
    expect(verifyConsistency(sodium, 6, 8, fromHex(ROOT_8), fromHex(ROOT_6), proof)).toBe(false);
  });
});

describe('known answers shared with the API', () => {
  it('derives the same leaf id and leaf hash', () => {
    expect(hex(leafIdOf(sodium, 'user-1'))).toBe('9ac7dff4ff7087807ddab3a71b19bb64cdd9e31eb82eff9de9aa4f35886ab2b8');
    const hash = leafHash(sodium, { userId: 'user-1', version: 2, identityKey: 'pub-key-1', signingKey: 'WxVi_oq1Q_DMJpBSIrYGqIMN84-KfUWmwVnqbavaJHA' });
    expect(hex(hash as Uint8Array)).toBe('8311767ef97cc7fce481676e6db7b103026c3151a0f5b87de56efab8e83f6ce0');
  });

  it('verifies a head signed by the API with a fixed seed', () => {
    const head = {
      size: 7,
      root: 'BQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU',
      issuedAt: 1700000000000,
      signature: 'XmqF9oSMBUaK-GeXphIt7Pu_sO_LKtIX4L1hj7oeSYudMU_VJCFAu4ctWiM1dCerbwRWMnTXGEzRIAXnSziGDw',
    };
    const logKey = '_RckOFqgx1tk-3jNYC-h2ZH96_drE8WO1wLqyDXp9hg';
    expect(verifyHeadSignature(sodium, head, logKey)).toBe(true);
    expect(verifyHeadSignature(sodium, { ...head, size: 8 }, logKey)).toBe(false);
    expect(verifyHeadSignature(sodium, { ...head, issuedAt: head.issuedAt + 1 }, logKey)).toBe(false);
    expect(verifyHeadSignature(sodium, head, 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBe(false);
    expect(verifyHeadSignature(sodium, head, 'short')).toBe(false);
  });
});

describe('leaf hashing', () => {
  const base = { userId: 'u', version: 1, identityKey: 'k', signingKey: 's' };

  it('rejects invalid leaves instead of throwing', () => {
    expect(leafHash(sodium, { ...base, version: 0 })).toBeNull();
    expect(leafHash(sodium, { ...base, version: 1.5 })).toBeNull();
    expect(leafHash(sodium, { ...base, identityKey: '' })).toBeNull();
    expect(leafHash(sodium, { ...base, identityKey: 'k'.repeat(256) })).toBeNull();
    expect(leafHash(sodium, { ...base, signingKey: 's'.repeat(256) })).toBeNull();
  });

  it('does not let fields bleed into each other', () => {
    expect(hex(leafHash(sodium, { ...base, identityKey: 'ab', signingKey: 'c' }) as Uint8Array)).not.toBe(
      hex(leafHash(sodium, { ...base, identityKey: 'a', signingKey: 'bc' }) as Uint8Array),
    );
  });
});

describe('proofs against an independent log implementation', () => {
  it('verifies every leaf of every size up to 40 and rejects every other leaf', async () => {
    const keys = await newLogKeys();
    const leaves: FakeLeaf[] = Array.from({ length: 40 }, (_, i) => ({ userId: `u${i}`, version: 1, identityKey: `pub-${i}`, signingKey: `sign-${i}` }));
    const log = new FakeLog(keys, leaves);
    for (let size = 1; size <= 40; size += 1) {
      const root = log.root(size);
      for (let index = 0; index < size; index += 1) {
        const leaf = leafHash(sodium, leaves[index] as FakeLeaf) as Uint8Array;
        const proof = decodeProof(sodium, log.inclusion(index, size)) as Uint8Array[];
        expect(verifyInclusion(sodium, leaf, index, size, proof, root)).toBe(true);
        const other = leafHash(sodium, leaves[(index + 1) % size] as FakeLeaf) as Uint8Array;
        if (size > 1) {
          expect(verifyInclusion(sodium, other, index, size, proof, root)).toBe(false);
        }
      }
    }
  });

  it('verifies every consistency pair up to 33 and rejects swapped or truncated proofs', async () => {
    const keys = await newLogKeys();
    const leaves: FakeLeaf[] = Array.from({ length: 33 }, (_, i) => ({ userId: `u${i}`, version: 1, identityKey: `pub-${i}`, signingKey: '' }));
    const log = new FakeLog(keys, leaves);
    for (let second = 1; second <= 33; second += 1) {
      for (let first = 1; first <= second; first += 1) {
        const proof = decodeProof(sodium, log.consistency(first, second)) as Uint8Array[];
        expect(verifyConsistency(sodium, first, second, log.root(first), log.root(second), proof)).toBe(true);
        if (first < second) {
          expect(verifyConsistency(sodium, first, second, log.root(second), log.root(first), proof)).toBe(false);
          expect(verifyConsistency(sodium, first, second, log.root(first), log.root(second), proof.slice(0, -1))).toBe(false);
        }
      }
    }
  });

  it('refuses sizes and indexes outside of the tree and oversized proofs', async () => {
    const keys = await newLogKeys();
    const log = new FakeLog(keys, [{ userId: 'u', version: 1, identityKey: 'k', signingKey: '' }]);
    const leaf = leafHash(sodium, log.leaves[0] as FakeLeaf) as Uint8Array;
    expect(verifyInclusion(sodium, leaf, 1, 1, [], log.root())).toBe(false);
    expect(verifyInclusion(sodium, leaf, -1, 1, [], log.root())).toBe(false);
    expect(verifyInclusion(sodium, leaf, 0, 1, [], log.root())).toBe(true);
    expect(verifyInclusion(sodium, leaf, 0, 1, Array.from({ length: 65 }, () => new Uint8Array(32)), log.root())).toBe(false);
    expect(verifyConsistency(sodium, 0, 1, log.root(), log.root(), [])).toBe(false);
    expect(verifyConsistency(sodium, 2, 1, log.root(), log.root(), [])).toBe(false);
  });
});

describe('wire validation', () => {
  it('accepts only well formed signed heads', () => {
    const valid = { size: 1, root: 'A'.repeat(43), issuedAt: 1, signature: 'A'.repeat(86) };
    expect(isSignedTreeHead(valid)).toBe(true);
    for (const broken of [
      null,
      'x',
      { ...valid, size: -1 },
      { ...valid, size: 1.5 },
      { ...valid, size: 2 ** 49 },
      { ...valid, root: 'A'.repeat(42) },
      { ...valid, signature: '*'.repeat(86) },
      { ...valid, issuedAt: '1' },
    ]) {
      expect(isSignedTreeHead(broken)).toBe(false);
    }
  });

  it('decodes proofs strictly', () => {
    expect(decodeProof(sodium, [])).toEqual([]);
    expect(decodeProof(sodium, ['A'.repeat(43)])?.[0]).toHaveLength(32);
    expect(decodeProof(sodium, ['A'.repeat(42)])).toBeNull();
    expect(decodeProof(sodium, 'x')).toBeNull();
    expect(decodeProof(sodium, Array.from({ length: 65 }, () => 'A'.repeat(43)))).toBeNull();
  });
});
