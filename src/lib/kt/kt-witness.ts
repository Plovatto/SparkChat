import { getCurrentIdentity } from '@lib/e2ee/current-identity';
import { getSodium } from '@lib/e2ee/sodium';
import type { AppSocket } from '@lib/socket';
import { raiseKtAlert } from './kt-alerts';
import { getKtBuildConfig, getKtSocketConfig } from './kt-config';
import { isSignedTreeHead, verifyHeadSignature, type SignedTreeHead } from './kt-crypto';
import { compareWithOwnHead, refreshHead, resolveLogKey } from './kt-head';
import { loadOwnerState } from './kt-store';

const FETCH_TIMEOUT_MS = 6000;
const MAX_BODY_BYTES = 4096;

export type WitnessResult = 'ok' | 'unreachable' | 'skipped' | 'alert';

export type WitnessFetcher = (url: string) => Promise<string>;

async function defaultFetcher(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit', redirect: 'follow', referrerPolicy: 'no-referrer', signal: controller.signal });
    if (!response.ok) {
      throw new Error(`witness status ${response.status}`);
    }
    const text = await response.text();
    if (text.length > MAX_BODY_BYTES) {
      throw new Error('witness body too large');
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function parseWitnessHead(body: string): SignedTreeHead | null {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (parsed.v !== 1) {
      return null;
    }
    const head = { size: parsed.size, root: parsed.root, issuedAt: parsed.issuedAt, signature: parsed.signature };
    return isSignedTreeHead(head) ? head : null;
  } catch {
    return null;
  }
}

export async function checkWitness(socket: AppSocket, fetcher: WitnessFetcher = defaultFetcher): Promise<WitnessResult> {
  const witnessUrl = getKtBuildConfig().witnessUrl;
  const config = getKtSocketConfig(socket);
  const identity = getCurrentIdentity();
  if (!witnessUrl || !config || !identity) {
    return 'skipped';
  }
  const ownerId = identity.userId;
  const resolution = resolveLogKey(ownerId, config);
  if (!resolution.ok) {
    return 'alert';
  }

  let body: string;
  try {
    body = await fetcher(witnessUrl);
  } catch {
    return 'unreachable';
  }
  const witnessed = parseWitnessHead(body);
  if (!witnessed) {
    return 'unreachable';
  }
  const sodium = await getSodium();
  if (!verifyHeadSignature(sodium, witnessed, resolution.logPublicKey)) {
    return 'unreachable';
  }

  const own = loadOwnerState(ownerId).head;
  if (!own) {
    return 'skipped';
  }

  if (witnessed.size > own.size) {
    const fresh = await refreshHead(socket, ownerId, resolution.logPublicKey);
    if (fresh.outcome === 'unreachable') {
      return 'unreachable';
    }
    if (fresh.outcome !== 'ok') {
      return 'alert';
    }
    if (!fresh.head || fresh.head.size < witnessed.size) {
      raiseKtAlert(ownerId, 'splitView', 'split-view', `witness-ahead:${witnessed.size}`);
      return 'alert';
    }
  }

  const outcome = await compareWithOwnHead(socket, ownerId, resolution.logPublicKey, witnessed, 'witness');
  if (outcome === 'fork') {
    return 'alert';
  }
  return outcome === 'unreachable' ? 'unreachable' : 'ok';
}
