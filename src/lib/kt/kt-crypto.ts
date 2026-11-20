import type { getSodium } from '@lib/e2ee/sodium';

export type Sodium = Awaited<ReturnType<typeof getSodium>>;

export interface SignedTreeHead {
  size: number;
  root: string;
  issuedAt: number;
  signature: string;
}

export interface LeafFields {
  userId: string;
  version: number;
  identityKey: string;
  signingKey: string;
}

const HEAD_DOMAIN = 'sparkchat:kt:sth:v1\n';
const LEAF_ID_DOMAIN = 'sparkchat:kt:leaf-id:v1:';
const LEAF_FORMAT_VERSION = 1;
const MAX_KEY_BYTES = 255;
const HASH_BYTES = 32;
const SIGNATURE_BYTES = 64;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export const MAX_TREE_SIZE = 2 ** 48;
export const MAX_PROOF_LENGTH = 64;

export function decodeBase64Url(sodium: Sodium, value: unknown, length?: number): Uint8Array | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 8192 || !BASE64URL.test(value)) {
    return null;
  }
  try {
    const bytes = sodium.from_base64(value, sodium.base64_variants.URLSAFE_NO_PADDING);
    return length === undefined || bytes.length === length ? bytes : null;
  } catch {
    return null;
  }
}

export function isSignedTreeHead(value: unknown): value is SignedTreeHead {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const head = value as Record<string, unknown>;
  return (
    typeof head.size === 'number' &&
    Number.isSafeInteger(head.size) &&
    head.size >= 0 &&
    head.size <= MAX_TREE_SIZE &&
    typeof head.issuedAt === 'number' &&
    Number.isSafeInteger(head.issuedAt) &&
    head.issuedAt >= 0 &&
    typeof head.root === 'string' &&
    head.root.length === 43 &&
    BASE64URL.test(head.root) &&
    typeof head.signature === 'string' &&
    head.signature.length === 86 &&
    BASE64URL.test(head.signature)
  );
}

export function headSigningBytes(size: number, root: Uint8Array, issuedAt: number): Uint8Array {
  const domain = new TextEncoder().encode(HEAD_DOMAIN);
  const bytes = new Uint8Array(domain.length + 8 + HASH_BYTES + 8);
  const view = new DataView(bytes.buffer);
  bytes.set(domain, 0);
  view.setBigUint64(domain.length, BigInt(size));
  bytes.set(root, domain.length + 8);
  view.setBigUint64(domain.length + 8 + HASH_BYTES, BigInt(issuedAt));
  return bytes;
}

export function verifyHeadSignature(sodium: Sodium, head: SignedTreeHead, logPublicKey: string): boolean {
  const root = decodeBase64Url(sodium, head.root, HASH_BYTES);
  const signature = decodeBase64Url(sodium, head.signature, SIGNATURE_BYTES);
  const publicKey = decodeBase64Url(sodium, logPublicKey, sodium.crypto_sign_PUBLICKEYBYTES);
  if (!root || !signature || !publicKey) {
    return false;
  }
  try {
    return sodium.crypto_sign_verify_detached(signature, headSigningBytes(head.size, root, head.issuedAt), publicKey);
  } catch {
    return false;
  }
}

function sha256(sodium: Sodium, ...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return sodium.crypto_hash_sha256(joined);
}

export function leafIdOf(sodium: Sodium, userId: string): Uint8Array {
  return sha256(sodium, new TextEncoder().encode(LEAF_ID_DOMAIN), new TextEncoder().encode(userId));
}

export function leafHash(sodium: Sodium, fields: LeafFields): Uint8Array | null {
  const identity = new TextEncoder().encode(fields.identityKey);
  const signing = new TextEncoder().encode(fields.signingKey);
  if (
    identity.length === 0 ||
    identity.length > MAX_KEY_BYTES ||
    signing.length > MAX_KEY_BYTES ||
    !Number.isInteger(fields.version) ||
    fields.version < 1 ||
    fields.version > 0xffffffff
  ) {
    return null;
  }
  const data = new Uint8Array(1 + HASH_BYTES + 4 + 2 + identity.length + 2 + signing.length);
  const view = new DataView(data.buffer);
  let offset = 0;
  data[offset] = LEAF_FORMAT_VERSION;
  offset += 1;
  data.set(leafIdOf(sodium, fields.userId), offset);
  offset += HASH_BYTES;
  view.setUint32(offset, fields.version);
  offset += 4;
  view.setUint16(offset, identity.length);
  offset += 2;
  data.set(identity, offset);
  offset += identity.length;
  view.setUint16(offset, signing.length);
  offset += 2;
  data.set(signing, offset);
  return sha256(sodium, new Uint8Array([0x00]), data);
}

function hashChildren(sodium: Sodium, left: Uint8Array, right: Uint8Array): Uint8Array {
  return sha256(sodium, new Uint8Array([0x01]), left, right);
}

function equal(sodium: Sodium, a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && sodium.memcmp(a, b);
}

function isPowerOfTwo(n: number): boolean {
  return n > 0 && Number.isInteger(Math.log2(n));
}

export function verifyInclusion(sodium: Sodium, leaf: Uint8Array, index: number, size: number, proof: Uint8Array[], root: Uint8Array): boolean {
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(size) || index < 0 || index >= size || size > MAX_TREE_SIZE) {
    return false;
  }
  if (proof.length > MAX_PROOF_LENGTH) {
    return false;
  }
  let fn = index;
  let sn = size - 1;
  let r = leaf;
  for (const p of proof) {
    if (sn === 0) {
      return false;
    }
    if (fn % 2 === 1 || fn === sn) {
      r = hashChildren(sodium, p, r);
      if (fn % 2 === 0) {
        while (fn % 2 === 0 && fn !== 0) {
          fn = Math.floor(fn / 2);
          sn = Math.floor(sn / 2);
        }
      }
    } else {
      r = hashChildren(sodium, r, p);
    }
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  return sn === 0 && equal(sodium, r, root);
}

export function verifyConsistency(
  sodium: Sodium,
  first: number,
  second: number,
  firstRoot: Uint8Array,
  secondRoot: Uint8Array,
  proof: Uint8Array[],
): boolean {
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(second) || first < 1 || first > second || second > MAX_TREE_SIZE) {
    return false;
  }
  if (proof.length > MAX_PROOF_LENGTH) {
    return false;
  }
  if (first === second) {
    return proof.length === 0 && equal(sodium, firstRoot, secondRoot);
  }
  const nodes = isPowerOfTwo(first) ? [firstRoot, ...proof] : [...proof];
  const head = nodes[0];
  if (!head) {
    return false;
  }
  let fn = first - 1;
  let sn = second - 1;
  while (fn % 2 === 1) {
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  let fr = head;
  let sr = head;
  for (const c of nodes.slice(1)) {
    if (sn === 0) {
      return false;
    }
    if (fn % 2 === 1 || fn === sn) {
      fr = hashChildren(sodium, c, fr);
      sr = hashChildren(sodium, c, sr);
      if (fn % 2 === 0) {
        while (fn % 2 === 0 && fn !== 0) {
          fn = Math.floor(fn / 2);
          sn = Math.floor(sn / 2);
        }
      }
    } else {
      sr = hashChildren(sodium, sr, c);
    }
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  return sn === 0 && equal(sodium, fr, firstRoot) && equal(sodium, sr, secondRoot);
}

export function decodeProof(sodium: Sodium, proof: unknown): Uint8Array[] | null {
  if (!Array.isArray(proof) || proof.length > MAX_PROOF_LENGTH) {
    return null;
  }
  const decoded: Uint8Array[] = [];
  for (const item of proof) {
    const bytes = decodeBase64Url(sodium, item, HASH_BYTES);
    if (!bytes) {
      return null;
    }
    decoded.push(bytes);
  }
  return decoded;
}
