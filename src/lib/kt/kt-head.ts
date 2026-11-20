import type { AppSocket } from '@lib/socket';
import { getSodium } from '@lib/e2ee/sodium';
import { raiseKtAlert, selectOwnerForAlerts } from './kt-alerts';
import { getKtBuildConfig, type KtSocketConfig } from './kt-config';
import { decodeBase64Url, decodeProof, isSignedTreeHead, verifyConsistency, verifyHeadSignature, type SignedTreeHead } from './kt-crypto';
import { KtUnavailableError, ktRequest, ktRequestWithRetry } from './kt-rpc';
import { loadOwnerState, saveOwnerState, updateOwnerState } from './kt-store';

export type LogKeyResolution = { ok: true; logPublicKey: string } | { ok: false };

export type HeadOutcome = 'ok' | 'unreachable' | 'fork' | 'rollback' | 'invalid';

export function resolveLogKey(ownerId: string, config: KtSocketConfig): LogKeyResolution {
  const build = getKtBuildConfig();
  if (build.pinnedLogPublicKey && build.pinnedLogPublicKey !== config.logPublicKey) {
    raiseKtAlert(ownerId, 'logKeyChanged', 'log-key:build', 'build');
    return { ok: false };
  }
  const state = loadOwnerState(ownerId);
  if (state.logPublicKey === null) {
    saveOwnerState(ownerId, { ...state, logPublicKey: config.logPublicKey });
    return { ok: true, logPublicKey: config.logPublicKey };
  }
  if (state.logPublicKey !== config.logPublicKey) {
    raiseKtAlert(ownerId, 'logKeyChanged', 'log-key:stored', 'stored');
    return { ok: false };
  }
  return { ok: true, logPublicKey: state.logPublicKey };
}

export function expectsKt(ownerId: string): boolean {
  const state = loadOwnerState(ownerId);
  return Boolean(getKtBuildConfig().pinnedLogPublicKey) || state.logPublicKey !== null || state.head !== null;
}

export function acceptNewLogKey(ownerId: string): void {
  updateOwnerState(ownerId, (state) => ({ ...state, logPublicKey: null, head: null, candidate: null, contacts: {} }));
}

function raiseSplitView(ownerId: string, detail: string): void {
  raiseKtAlert(ownerId, 'splitView', 'split-view', detail);
}

export async function acceptHead(socket: AppSocket, ownerId: string, logPublicKey: string, candidate: unknown): Promise<HeadOutcome> {
  if (!isSignedTreeHead(candidate)) {
    return 'invalid';
  }
  const head: SignedTreeHead = candidate;
  const sodium = await getSodium();
  if (!verifyHeadSignature(sodium, head, logPublicKey)) {
    raiseKtAlert(ownerId, 'logKeyChanged', 'log-key:signature', 'signature');
    return 'invalid';
  }
  selectOwnerForAlerts(ownerId);

  const stored = loadOwnerState(ownerId).head;
  if (!stored || stored.size === 0) {
    updateOwnerState(ownerId, (state) => ({ ...state, head, candidate: null }));
    return 'ok';
  }
  if (head.size === stored.size) {
    if (head.root !== stored.root) {
      raiseSplitView(ownerId, `same-size:${head.size}`);
      return 'fork';
    }
    return 'ok';
  }
  if (head.size < stored.size) {
    raiseSplitView(ownerId, `rollback:${stored.size}>${head.size}`);
    return 'rollback';
  }

  const outcome = await checkConsistency(socket, stored, head);
  if (outcome === 'ok') {
    updateOwnerState(ownerId, (state) => ({ ...state, head, candidate: null }));
  } else if (outcome === 'fork') {
    raiseSplitView(ownerId, `inconsistent:${stored.size}->${head.size}`);
    updateOwnerState(ownerId, (state) => ({ ...state, candidate: null }));
  } else {
    updateOwnerState(ownerId, (state) => ({ ...state, candidate: head }));
  }
  return outcome;
}

export async function checkConsistency(socket: AppSocket, older: SignedTreeHead, newer: SignedTreeHead): Promise<'ok' | 'fork' | 'unreachable'> {
  if (older.size >= newer.size) {
    return older.size === newer.size && older.root === newer.root ? 'ok' : 'fork';
  }
  try {
    const reply = await ktRequestWithRetry(socket, 'kt:get-consistency', 'kt:consistency', { first: older.size, second: newer.size });
    if (reply.proof === null) {
      return 'fork';
    }
    const sodium = await getSodium();
    const proof = reply.first === older.size && reply.second === newer.size ? decodeProof(sodium, reply.proof) : null;
    const olderRoot = decodeBase64Url(sodium, older.root, 32);
    const newerRoot = decodeBase64Url(sodium, newer.root, 32);
    if (!proof || !olderRoot || !newerRoot) {
      return 'fork';
    }
    return verifyConsistency(sodium, older.size, newer.size, olderRoot, newerRoot, proof) ? 'ok' : 'fork';
  } catch (error) {
    if (error instanceof KtUnavailableError) {
      return 'unreachable';
    }
    throw error;
  }
}

export async function refreshHead(socket: AppSocket, ownerId: string, logPublicKey: string): Promise<{ outcome: HeadOutcome; head: SignedTreeHead | null }> {
  try {
    const reply = await ktRequest(socket, 'kt:get-head', 'kt:head', {});
    const outcome = await acceptHead(socket, ownerId, logPublicKey, reply.head);
    return { outcome, head: isSignedTreeHead(reply.head) ? reply.head : null };
  } catch (error) {
    if (error instanceof KtUnavailableError) {
      return { outcome: 'unreachable', head: null };
    }
    throw error;
  }
}

export async function compareWithOwnHead(
  socket: AppSocket,
  ownerId: string,
  logPublicKey: string,
  theirs: SignedTreeHead,
  source: 'gossip' | 'witness',
): Promise<'ok' | 'fork' | 'unreachable' | 'skipped'> {
  const sodium = await getSodium();
  if (theirs.size === 0 || !verifyHeadSignature(sodium, theirs, logPublicKey)) {
    return 'skipped';
  }
  const own = loadOwnerState(ownerId).head;
  if (!own || own.size === 0) {
    return 'skipped';
  }
  const outcome = theirs.size >= own.size ? await checkConsistency(socket, own, theirs) : await checkConsistency(socket, theirs, own);
  if (outcome === 'fork') {
    raiseSplitView(ownerId, `${source}:${Math.min(own.size, theirs.size)}`);
  }
  return outcome;
}

export async function retryCandidateHead(socket: AppSocket, ownerId: string, logPublicKey: string): Promise<HeadOutcome | 'none'> {
  const candidate = loadOwnerState(ownerId).candidate;
  if (!candidate) {
    return 'none';
  }
  return acceptHead(socket, ownerId, logPublicKey, candidate);
}
