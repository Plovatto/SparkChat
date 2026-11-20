import { getSodium } from './sodium';

const CONTEXT_V1 = 'sparkchat:safety-number:v1';
const CONTEXT_V2 = 'sparkchat:safety-number:v2';
const GROUPS = 12;
const DIGITS_PER_GROUP = 5;
const QR_PREFIX_V1 = 'sparkchat-verify:1:';
const QR_PREFIX_V2 = 'sparkchat-verify:2:';

export interface IdentityRef {
  userId: string;
  publicKey: string;
  signingPublicKey?: string | null | undefined;
}

export interface SafetyNumber {
  version: 1 | 2;
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
  const covered = Boolean(first.signingPublicKey && second.signingPublicKey);
  const input = sodium.from_string(
    JSON.stringify(
      covered
        ? [
            CONTEXT_V2,
            first.userId,
            first.publicKey,
            first.signingPublicKey,
            second.userId,
            second.publicKey,
            second.signingPublicKey,
          ]
        : [CONTEXT_V1, first.userId, first.publicKey, second.userId, second.publicKey],
    ),
  );
  const hash = sodium.crypto_generichash(GROUPS * 4, input, null);
  const view = new DataView(hash.buffer, hash.byteOffset, hash.byteLength);

  const groups: string[] = [];
  for (let index = 0; index < GROUPS; index += 1) {
    const value = view.getUint32(index * 4, false) % 10 ** DIGITS_PER_GROUP;
    groups.push(String(value).padStart(DIGITS_PER_GROUP, '0'));
  }

  const digits = groups.join('');
  return { version: covered ? 2 : 1, digits, groups, qrPayload: `${covered ? QR_PREFIX_V2 : QR_PREFIX_V1}${digits}` };
}
