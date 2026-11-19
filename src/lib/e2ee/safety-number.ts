import { getSodium } from './sodium';

const CONTEXT = 'sparkchat:safety-number:v1';
const GROUPS = 12;
const DIGITS_PER_GROUP = 5;
const QR_PREFIX = 'sparkchat-verify:1:';

export interface IdentityRef {
  userId: string;
  publicKey: string;
}

export interface SafetyNumber {
  digits: string;
  groups: string[];
  qrPayload: string;
}

function ordered(a: IdentityRef, b: IdentityRef): [IdentityRef, IdentityRef] {
  return a.userId <= b.userId ? [a, b] : [b, a];
}

export async function computeSafetyNumber(own: IdentityRef, contact: IdentityRef): Promise<SafetyNumber> {
  const sodium = await getSodium();
  const [first, second] = ordered(own, contact);
  const input = sodium.from_string(
    JSON.stringify([CONTEXT, first.userId, first.publicKey, second.userId, second.publicKey]),
  );
  const hash = sodium.crypto_generichash(GROUPS * 4, input, null);
  const view = new DataView(hash.buffer, hash.byteOffset, hash.byteLength);

  const groups: string[] = [];
  for (let index = 0; index < GROUPS; index += 1) {
    const value = view.getUint32(index * 4, false) % 10 ** DIGITS_PER_GROUP;
    groups.push(String(value).padStart(DIGITS_PER_GROUP, '0'));
  }

  const digits = groups.join('');
  return { digits, groups, qrPayload: `${QR_PREFIX}${digits}` };
}
