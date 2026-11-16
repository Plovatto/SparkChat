export interface CurrentIdentity {
  userId: string;
  publicKey: string;
  privateKey: Uint8Array;
}

export type CurrentIdentityListener = (identity: CurrentIdentity | null) => void;

let current: CurrentIdentity | null = null;
const listeners = new Set<CurrentIdentityListener>();

export function setCurrentIdentity(identity: CurrentIdentity | null): void {
  current = identity;
  for (const listener of Array.from(listeners)) {
    try {
      listener(identity);
    } catch (error) {
      console.error('[e2e] identity listener failed', error);
    }
  }
}

export function getCurrentIdentity(): CurrentIdentity | null {
  return current;
}

export function subscribeCurrentIdentity(listener: CurrentIdentityListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
