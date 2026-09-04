export interface CurrentIdentity {
  userId: string;
  publicKey: string;
  privateKey: Uint8Array;
}

let current: CurrentIdentity | null = null;

export function setCurrentIdentity(identity: CurrentIdentity | null): void {
  current = identity;
}

export function getCurrentIdentity(): CurrentIdentity | null {
  return current;
}
