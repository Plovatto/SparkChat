import type sodiumModule from 'libsodium-wrappers-sumo';
import type * as SodiumNamespace from '@lib/e2ee/sodium';

type Sodium = typeof sodiumModule;
type SodiumModule = typeof SodiumNamespace;

function withFastPwhash(sodium: Sodium): Sodium {
  const fast: Sodium = Object.create(sodium) as Sodium;
  const pwhash = (length: number, password: string | Uint8Array, salt: Uint8Array, _opsLimit: number, _memLimit: number, algorithm: number) =>
    sodium.crypto_pwhash(length, password, salt, sodium.crypto_pwhash_OPSLIMIT_MIN, sodium.crypto_pwhash_MEMLIMIT_MIN, algorithm);
  Object.defineProperty(fast, 'crypto_pwhash', { value: pwhash });
  return fast;
}

export async function fastSodiumModule(importOriginal: () => Promise<SodiumModule>): Promise<SodiumModule> {
  const actual = await importOriginal();
  let ready: Promise<Sodium> | null = null;
  return { ...actual, getSodium: () => (ready ??= actual.getSodium().then(withFastPwhash)) };
}
