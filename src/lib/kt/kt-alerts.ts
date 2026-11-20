import { loadAlerts, saveAlerts, type KtAlert, type KtAlertKind } from './kt-store';

const RERAISE_AFTER_MS = 24 * 60 * 60 * 1000;

type Listener = () => void;

const listeners = new Set<Listener>();
let activeOwner: string | null = null;
let cache: KtAlert[] = [];
let active: KtAlert[] = [];
let sequence = 0;

function notify(): void {
  active = cache.filter((alert) => alert.dismissedAt === null);
  for (const listener of Array.from(listeners)) {
    listener();
  }
}

function ensureOwner(ownerId: string): void {
  if (activeOwner !== ownerId) {
    activeOwner = ownerId;
    cache = loadAlerts(ownerId);
    notify();
  }
}

export function subscribeKtAlerts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function selectOwnerForAlerts(ownerId: string | null): void {
  if (ownerId === null) {
    activeOwner = null;
    cache = [];
    notify();
    return;
  }
  ensureOwner(ownerId);
}

export function getActiveKtAlerts(): KtAlert[] {
  return active;
}

export function getKtAlertLog(): KtAlert[] {
  return cache;
}

export function raiseKtAlert(ownerId: string, kind: KtAlertKind, dedupeKey: string, detail?: string, now: number = Date.now()): KtAlert | null {
  ensureOwner(ownerId);
  const existing = cache.find((alert) => alert.dedupeKey === dedupeKey);
  if (existing && (existing.dismissedAt === null || now - existing.at < RERAISE_AFTER_MS)) {
    return null;
  }
  sequence += 1;
  const alert: KtAlert = { id: `${now}-${sequence}`, kind, dedupeKey, at: now, dismissedAt: null, ...(detail ? { detail } : {}) };
  cache = [alert, ...cache.filter((other) => other.dedupeKey !== dedupeKey)];
  saveAlerts(ownerId, cache);
  notify();
  return alert;
}

export function dismissKtAlert(id: string, now: number = Date.now()): void {
  if (!activeOwner) {
    return;
  }
  cache = cache.map((alert) => (alert.id === id && alert.dismissedAt === null ? { ...alert, dismissedAt: now } : alert));
  saveAlerts(activeOwner, cache);
  notify();
}

export function resetKtAlerts(): void {
  activeOwner = null;
  cache = [];
  sequence = 0;
  notify();
}
