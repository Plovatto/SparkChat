import { getCurrentIdentity } from '@lib/e2ee/current-identity';
import { getSodium } from '@lib/e2ee/sodium';
import type { AppSocket, E2ePublicKeyEntry } from '@lib/socket';
import { raiseKtAlert, selectOwnerForAlerts } from './kt-alerts';
import { getKtSocketConfig } from './kt-config';
import { decodeBase64Url, decodeProof, isSignedTreeHead, leafHash, verifyHeadSignature, verifyInclusion } from './kt-crypto';
import { acceptHead, resolveLogKey } from './kt-head';
import { KtUnavailableError, ktRequest } from './kt-rpc';

const MAX_ITEMS_PER_REQUEST = 50;
const VERIFIED_TTL_MS = 10 * 60 * 1000;
const MAX_VERIFIED_CACHE = 2000;

const UNREACHABLE_BACKOFF_MS = 30 * 1000;

const verified = new Map<string, number>();
let unreachableUntil = 0;

function cacheKey(ownerId: string, entry: E2ePublicKeyEntry): string {
  return JSON.stringify([ownerId, entry.userId, entry.publicKey, entry.signingPublicKey ?? '']);
}

export function resetKtVerificationCache(): void {
  verified.clear();
  unreachableUntil = 0;
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

async function verifyChunk(
  socket: AppSocket,
  ownerId: string,
  logPublicKey: string,
  chunk: E2ePublicKeyEntry[],
): Promise<E2ePublicKeyEntry[]> {
  let reply;
  try {
    reply = await ktRequest(socket, 'kt:get-proofs', 'kt:proofs', {
      items: chunk.map((entry) => ({
        userId: entry.userId,
        publicKey: entry.publicKey,
        ...(entry.signingPublicKey ? { signingPublicKey: entry.signingPublicKey } : {}),
      })),
    });
  } catch (error) {
    if (error instanceof KtUnavailableError) {
      unreachableUntil = Date.now() + UNREACHABLE_BACKOFF_MS;
      return chunk;
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
  if (outcome === 'fork' || outcome === 'rollback' || outcome === 'invalid') {
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
    remember(cacheKey(ownerId, entry), now);
    accepted.push(entry);
  }
  return accepted;
}

export async function verifyPublicKeyEntries(socket: AppSocket, entries: E2ePublicKeyEntry[]): Promise<E2ePublicKeyEntry[]> {
  const config = getKtSocketConfig(socket);
  const identity = getCurrentIdentity();
  if (!config || !identity || entries.length === 0) {
    return entries;
  }
  const ownerId = identity.userId;
  selectOwnerForAlerts(ownerId);

  const resolution = resolveLogKey(ownerId, config);
  if (!resolution.ok) {
    return [];
  }

  const now = Date.now();
  if (now < unreachableUntil) {
    return entries;
  }
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

  try {
    for (const chunk of chunked(pending, MAX_ITEMS_PER_REQUEST)) {
      for (const entry of await verifyChunk(socket, ownerId, resolution.logPublicKey, chunk)) {
        trusted.add(entry);
      }
    }
  } catch (error) {
    console.error('[kt] key verification failed unexpectedly, refusing the keys', error);
    return entries.filter((entry) => trusted.has(entry));
  }

  return entries.filter((entry) => trusted.has(entry));
}
