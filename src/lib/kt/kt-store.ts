import { getItem, setItem } from '@lib/storage';
import { isSignedTreeHead, type SignedTreeHead } from './kt-crypto';

export interface KnownOwnKeys {
  publicKey: string;
  signingPublicKey: string | null;
}

export interface KtOwnerState {
  logPublicKey: string | null;
  head: SignedTreeHead | null;
  ownKeys: KnownOwnKeys[];
}

export type KtAlertKind = 'unknownOwnKey' | 'splitView' | 'keyRejected' | 'logKeyChanged';

export interface KtAlert {
  id: string;
  kind: KtAlertKind;
  dedupeKey: string;
  at: number;
  dismissedAt: number | null;
  detail?: string;
}

export interface KtStorage {
  read<T>(key: string): T | null;
  write<T>(key: string, value: T): void;
}

const STATE_PREFIX = 'sparkchat:kt:v1:state:';
const ALERT_PREFIX = 'sparkchat:kt:v1:alerts:';
const MAX_OWN_KEYS = 8;
const MAX_ALERTS = 40;

let backend: KtStorage = { read: getItem, write: setItem };

export function setKtStorage(next: KtStorage | null): void {
  backend = next ?? { read: getItem, write: setItem };
}

function isKnownKeys(value: unknown): value is KnownOwnKeys {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const keys = value as Record<string, unknown>;
  return typeof keys.publicKey === 'string' && (keys.signingPublicKey === null || typeof keys.signingPublicKey === 'string');
}

export function loadOwnerState(ownerId: string): KtOwnerState {
  const stored = backend.read<Partial<KtOwnerState>>(`${STATE_PREFIX}${ownerId}`);
  return {
    logPublicKey: typeof stored?.logPublicKey === 'string' ? stored.logPublicKey : null,
    head: isSignedTreeHead(stored?.head) ? stored.head : null,
    ownKeys: Array.isArray(stored?.ownKeys) ? stored.ownKeys.filter(isKnownKeys).slice(0, MAX_OWN_KEYS) : [],
  };
}

export function saveOwnerState(ownerId: string, state: KtOwnerState): void {
  backend.write(`${STATE_PREFIX}${ownerId}`, { ...state, ownKeys: state.ownKeys.slice(0, MAX_OWN_KEYS) });
}

export function updateOwnerState(ownerId: string, change: (state: KtOwnerState) => KtOwnerState): KtOwnerState {
  const next = change(loadOwnerState(ownerId));
  saveOwnerState(ownerId, next);
  return next;
}

export function rememberOwnKeys(ownerId: string, keys: KnownOwnKeys): void {
  updateOwnerState(ownerId, (state) => {
    if (state.ownKeys.some((known) => known.publicKey === keys.publicKey && known.signingPublicKey === keys.signingPublicKey)) {
      return state;
    }
    return { ...state, ownKeys: [keys, ...state.ownKeys] };
  });
}

export function loadAlerts(ownerId: string): KtAlert[] {
  const stored = backend.read<unknown>(`${ALERT_PREFIX}${ownerId}`);
  if (!Array.isArray(stored)) {
    return [];
  }
  return stored
    .filter(
      (alert): alert is KtAlert =>
        typeof alert === 'object' &&
        alert !== null &&
        typeof (alert as KtAlert).id === 'string' &&
        typeof (alert as KtAlert).kind === 'string' &&
        typeof (alert as KtAlert).dedupeKey === 'string' &&
        typeof (alert as KtAlert).at === 'number',
    )
    .slice(0, MAX_ALERTS);
}

export function saveAlerts(ownerId: string, alerts: KtAlert[]): void {
  backend.write(`${ALERT_PREFIX}${ownerId}`, alerts.slice(0, MAX_ALERTS));
}
