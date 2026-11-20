import { getItem, setItem } from '@lib/storage';
import { isSignedTreeHead, type SignedTreeHead } from './kt-crypto';

export interface KnownOwnKeys {
  publicKey: string;
  signingPublicKey: string | null;
}

export interface AcceptedContactKey {
  version: number;
  publicKey: string;
  signingKey: string;
  leafHash: string;
  at: number;
}

export interface OwnAudit {
  version: number;
  publicKey: string;
  signingPublicKey: string | null;
  at: number;
}

export interface KtOwnerState {
  logPublicKey: string | null;
  head: SignedTreeHead | null;
  candidate: SignedTreeHead | null;
  ownKeys: KnownOwnKeys[];
  contacts: Record<string, AcceptedContactKey>;
  ownAudit: OwnAudit | null;
}

export type KtAlertKind = 'unknownOwnKey' | 'splitView' | 'keyRejected' | 'logKeyChanged' | 'downgrade' | 'logUnavailable';

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
const MAX_CONTACTS = 1000;

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

function readContacts(value: unknown): Record<string, AcceptedContactKey> {
  const contacts: Record<string, AcceptedContactKey> = {};
  if (typeof value !== 'object' || value === null) {
    return contacts;
  }
  for (const [userId, raw] of Object.entries(value as Record<string, unknown>)) {
    const record = raw as Partial<AcceptedContactKey> | null;
    if (
      record &&
      typeof record.version === 'number' &&
      Number.isInteger(record.version) &&
      typeof record.publicKey === 'string' &&
      typeof record.signingKey === 'string' &&
      typeof record.leafHash === 'string' &&
      typeof record.at === 'number'
    ) {
      contacts[userId] = { version: record.version, publicKey: record.publicKey, signingKey: record.signingKey, leafHash: record.leafHash, at: record.at };
    }
  }
  return contacts;
}

function readOwnAudit(value: unknown): OwnAudit | null {
  const audit = value as Partial<OwnAudit> | null;
  if (
    audit &&
    typeof audit.version === 'number' &&
    typeof audit.publicKey === 'string' &&
    (audit.signingPublicKey === null || typeof audit.signingPublicKey === 'string') &&
    typeof audit.at === 'number'
  ) {
    return { version: audit.version, publicKey: audit.publicKey, signingPublicKey: audit.signingPublicKey, at: audit.at };
  }
  return null;
}

export function trimContacts(contacts: Record<string, AcceptedContactKey>): Record<string, AcceptedContactKey> {
  const entries = Object.entries(contacts);
  if (entries.length <= MAX_CONTACTS) {
    return contacts;
  }
  return Object.fromEntries(entries.sort((a, b) => b[1].at - a[1].at).slice(0, MAX_CONTACTS));
}

export function emptyOwnerState(): KtOwnerState {
  return { logPublicKey: null, head: null, candidate: null, ownKeys: [], contacts: {}, ownAudit: null };
}

export function loadOwnerState(ownerId: string): KtOwnerState {
  const stored = backend.read<Partial<KtOwnerState>>(`${STATE_PREFIX}${ownerId}`);
  return {
    logPublicKey: typeof stored?.logPublicKey === 'string' ? stored.logPublicKey : null,
    head: isSignedTreeHead(stored?.head) ? stored.head : null,
    candidate: isSignedTreeHead(stored?.candidate) ? stored.candidate : null,
    ownKeys: Array.isArray(stored?.ownKeys) ? stored.ownKeys.filter(isKnownKeys).slice(0, MAX_OWN_KEYS) : [],
    contacts: readContacts(stored?.contacts),
    ownAudit: readOwnAudit(stored?.ownAudit),
  };
}

export function saveOwnerState(ownerId: string, state: KtOwnerState): void {
  backend.write(`${STATE_PREFIX}${ownerId}`, { ...state, ownKeys: state.ownKeys.slice(0, MAX_OWN_KEYS), contacts: trimContacts(state.contacts) });
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
