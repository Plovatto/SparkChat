import { getCurrentIdentity } from '@lib/e2ee/current-identity';
import { ownSigningKey } from '@lib/e2ee/signing';
import { getSodium } from '@lib/e2ee/sodium';
import type { AppSocket } from '@lib/socket';
import { raiseKtAlert, selectOwnerForAlerts } from './kt-alerts';
import { getKtSocketConfig } from './kt-config';
import { decodeBase64Url, decodeProof, isSignedTreeHead, leafHash, verifyHeadSignature, verifyInclusion } from './kt-crypto';
import { acceptHead, resolveLogKey } from './kt-head';
import { KtUnavailableError, ktRequest } from './kt-rpc';
import { loadOwnerState, rememberOwnKeys, type KnownOwnKeys } from './kt-store';

const MAX_AUDIT_PAGES = 10;

export type SelfAuditResult = 'ok' | 'unreachable' | 'skipped' | 'alert';

function matchesKnownKeys(known: KnownOwnKeys[], entry: { publicKey: string; signingPublicKey: string | null }): boolean {
  return known.some(
    (keys) => keys.publicKey === entry.publicKey && (entry.signingPublicKey === null || entry.signingPublicKey === keys.signingPublicKey),
  );
}

export async function runSelfAudit(socket: AppSocket): Promise<SelfAuditResult> {
  const config = getKtSocketConfig(socket);
  const identity = getCurrentIdentity();
  if (!config || !identity) {
    return 'skipped';
  }
  const ownerId = identity.userId;
  selectOwnerForAlerts(ownerId);
  const resolution = resolveLogKey(ownerId, config);
  if (!resolution.ok) {
    return 'alert';
  }

  const sodium = await getSodium();
  rememberOwnKeys(ownerId, { publicKey: identity.publicKey, signingPublicKey: await ownSigningKey(identity.privateKey) });
  const known = loadOwnerState(ownerId).ownKeys;

  let result: SelfAuditResult = 'ok';
  let fromVersion = 1;
  let expectedVersion = 1;

  for (let page = 0; page < MAX_AUDIT_PAGES; page += 1) {
    let reply;
    try {
      reply = await ktRequest(socket, 'kt:audit', 'kt:audit', { fromVersion });
    } catch (error) {
      if (error instanceof KtUnavailableError) {
        return result === 'ok' ? 'unreachable' : result;
      }
      throw error;
    }

    const head = reply.head;
    if (!isSignedTreeHead(head) || !verifyHeadSignature(sodium, head, resolution.logPublicKey)) {
      raiseKtAlert(ownerId, 'logKeyChanged', 'log-key:signature', 'signature');
      return 'alert';
    }
    const outcome = await acceptHead(socket, ownerId, resolution.logPublicKey, head);
    if (outcome === 'fork' || outcome === 'rollback' || outcome === 'invalid') {
      return 'alert';
    }

    const root = decodeBase64Url(sodium, head.root, 32);
    const entries = Array.isArray(reply.entries) ? reply.entries : [];
    for (const entry of entries) {
      const proof = decodeProof(sodium, entry.proof);
      const leaf = leafHash(sodium, {
        userId: ownerId,
        version: entry.version,
        identityKey: entry.publicKey,
        signingKey: entry.signingPublicKey ?? '',
      });
      const included = root && proof && leaf && verifyInclusion(sodium, leaf, entry.position, head.size, proof, root);
      if (!included || entry.version !== expectedVersion) {
        raiseKtAlert(ownerId, 'splitView', 'split-view', `audit:${entry.version}`);
        return 'alert';
      }
      expectedVersion += 1;
      if (!matchesKnownKeys(known, entry)) {
        raiseKtAlert(ownerId, 'unknownOwnKey', `own-key:${entry.publicKey}:${entry.signingPublicKey ?? ''}`, `v${entry.version}`);
        result = 'alert';
      }
    }

    if (!reply.truncated || entries.length === 0) {
      return result;
    }
    fromVersion = expectedVersion;
  }
  return result;
}
