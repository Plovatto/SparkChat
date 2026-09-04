import type sodiumModule from 'libsodium-wrappers-sumo';

let readyPromise: Promise<typeof sodiumModule> | null = null;

export function getSodium(): Promise<typeof sodiumModule> {
  readyPromise ??= import('libsodium-wrappers-sumo').then(({ default: sodium }) => sodium.ready.then(() => sodium));
  return readyPromise;
}
