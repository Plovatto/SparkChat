import { getCurrentIdentity } from '@lib/e2ee/current-identity';
import { getSodium } from '@lib/e2ee/sodium';
import type { AppSocket, E2ePublicKeyEntry } from '@lib/socket';
import { raiseKtAlert, selectOwnerForAlerts } from './kt-alerts';
import { awaitKtConfig, getKtBuildConfig, getKtSocketConfig } from './kt-config';
import { decodeBase64Url, decodeProof, isSignedTreeHead, leafHash, verifyHeadSignature, verifyInclusion, type Sodium } from './kt-crypto';
import { acceptHead, expectsKt, resolveLogKey } from './kt-head';
import { KtOfflineError, KtServerError, ktRequestWithRetry } from './kt-rpc';
import { loadOwnerState, updateOwnerState } from './kt-store';

const MAX_ITEMS_PER_REQUEST = 50;
const VERIFIED_TTL_MS = 10 * 60 * 1000;
const MAX_VERIFIED_CACHE = 2000;
const TOTAL_VERIFY_CAP_MS = 15000;

const verified = new Map<string, number>();

function cacheKey(ownerId: string, entry: E2ePublicKeyEntry): string {
  return JSON.stringify([ownerId, entry.userId, entry.publicKey, entry.signingPublicKey ?? '']);
}

export function resetKtVerificationCache(): void {
  verified.clear();
}

function remember(key: string, now: number): void {
  if (verified.size >= MAX_VERIFIED_CACHE) {
    const oldest = verified.keys().next().value;
    if (oldest !== undefined) {
      verified.delete(oldest);
    }
  }
  verified.set(key, now);
}

function chunked<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function reject(ownerId: string, entry: E2ePublicKeyEntry, reason: string): void {
  raiseKtAlert(ownerId, 'keyRejected', `key-rejected:${entry.userId}`, reason);
}

function acceptContactVersion(sodium: Sodium, ownerId: string, entry: E2ePublicKeyEntry, version: number, leaf: Uint8Array, now: number): boolean {
  const encodedLeaf = sodium.to_base64(leaf);
  const known = loadOwnerState(ownerId).contacts[entry.userId];
  if (known && version < known.version) {
    reject(ownerId, entry, 'version-regression');
    return false;
  }
  if (known && version === known.version && known.leafHash !== encodedLeaf) {
    reject(ownerId, entry, 'version-conflict');
    return false;
  }
  if (!known || version > known.version) {
    updateOwnerState(ownerId, (state) => ({
      ...state,
      contacts: {
        ...state.contacts,
        [entry.userId]: { version, publicKey: entry.publicKey, signingKey: entry.signingPublicKey ?? '', leafHash: encodedLeaf, at: now },
      },
    }));
  }
  return true;
}

async function verifyChunk(
  socket: AppSocket,
  ownerId: string,
  logPublicKey: string,
  chunk: E2ePublicKeyEntry[],
  expected: boolean,
): Promise<E2ePublicKeyEntry[]> {
  let reply;
  try {
    reply = await ktRequestWithRetry(socket, 'kt:get-proofs', 'kt:proofs', {
      items: chunk.map((entry) => ({
        userId: entry.userId,
        publicKey: entry.publicKey,
        ...(entry.signingPublicKey ? { signingPublicKey: entry.signingPublicKey } : {}),
      })),
    });
  } catch (error) {
    if (error instanceof KtOfflineError) {
      return expected ? [] : chunk;
    }
    if (error instanceof KtServerError) {
      return [];
    }
    throw error;
  }

  const sodium = await getSodium();
  const head = reply.head;
  if (!isSignedTreeHead(head) || !verifyHeadSignature(sodium, head, logPublicKey)) {
    raiseKtAlert(ownerId, 'logKeyChanged', 'log-key:signature', 'signature');
    return [];
  }
  const outcome = await acceptHead(socket, ownerId, logPublicKey, head);
  if (outcome !== 'ok') {
    return [];
  }

  const root = decodeBase64Url(sodium, head.root, 32);
  const proofs = Array.isArray(reply.proofs) ? reply.proofs : [];
  const accepted: E2ePublicKeyEntry[] = [];
  const now = Date.now();
  for (const entry of chunk) {
    const result = proofs.find((proof) => typeof proof === 'object' && proof !== null && proof.userId === entry.userId);
    if (!result || !result.found) {
      reject(ownerId, entry, 'not-logged');
      continue;
    }
    const proof = decodeProof(sodium, result.proof);
    const leaf = leafHash(sodium, {
      userId: entry.userId,
      version: result.version,
      identityKey: entry.publicKey,
      signingKey: entry.signingPublicKey ?? '',
    });
    if (!root || !proof || !leaf || !verifyInclusion(sodium, leaf, result.position, head.size, proof, root)) {
      reject(ownerId, entry, 'bad-proof');
      continue;
    }
    if (!acceptContactVersion(sodium, ownerId, entry, result.version, leaf, now)) {
      continue;
    }
    remember(cacheKey(ownerId, entry), now);
    accepted.push(entry);
  }
  return accepted;
}

function previouslyAccepted(ownerId: string, entries: E2ePublicKeyEntry[]): E2ePublicKeyEntry[] {
  const contacts = loadOwnerState(ownerId).contacts;
  return entries.filter((entry) => {
    const known = contacts[entry.userId];
    return known !== undefined && known.publicKey === entry.publicKey && known.signingKey === (entry.signingPublicKey ?? '');
  });
}

export async function verifyPublicKeyEntries(socket: AppSocket, entries: E2ePublicKeyEntry[]): Promise<E2ePublicKeyEntry[]> {
  const identity = getCurrentIdentity();
  if (!identity || entries.length === 0) {
    return entries;
  }
  const ownerId = identity.userId;
  selectOwnerForAlerts(ownerId);
  const expected = expectsKt(ownerId);

  let config = getKtSocketConfig(socket);
  if (!config) {
    if (!expected) {
      return entries;
    }
    config = await awaitKtConfig(socket);
    if (!config) {
      raiseKtAlert(ownerId, 'downgrade', 'downgrade');
      return getKtBuildConfig().pinnedLogPublicKey ? previouslyAccepted(ownerId, entries) : entries;
    }
  }

  const resolution = resolveLogKey(ownerId, config);
  if (!resolution.ok) {
    return [];
  }

  const now = Date.now();
  const trusted = new Set<E2ePublicKeyEntry>();
  const pending: E2ePublicKeyEntry[] = [];
  for (const entry of entries) {
    const seenAt = verified.get(cacheKey(ownerId, entry));
    if (seenAt !== undefined && now - seenAt < VERIFIED_TTL_MS) {
      trusted.add(entry);
    } else {
      pending.push(entry);
    }
  }

  const work = (async () => {
    for (const chunk of chunked(pending, MAX_ITEMS_PER_REQUEST)) {
      for (const entry of await verifyChunk(socket, ownerId, resolution.logPublicKey, chunk, expected)) {
        trusted.add(entry);
      }
    }
  })().catch((error: unknown) => {
    console.error('[kt] key verification failed unexpectedly, refusing the keys', error);
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<'cap'>((resolve) => {
    timer = setTimeout(() => resolve('cap'), TOTAL_VERIFY_CAP_MS);
  });
  const finished = await Promise.race([work.then(() => 'done' as const), cap]);
  clearTimeout(timer);
  if (finished === 'cap') {
    raiseKtAlert(ownerId, 'logUnavailable', 'unavailable:verify-timeout', 'verify-timeout');
  }

  return entries.filter((entry) => trusted.has(entry));
}
