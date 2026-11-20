const STORAGE_PREFIX = 'sparkchat:verified-promotions:';
const MAX_ENTRIES_PER_ROOM = 500;

interface AdminLedger {
  promoted: Map<string, number>;
  departed: Map<string, number>;
}

const ledgers = new Map<string, AdminLedger>();

function storageKey(selfId: string, roomId: string): string {
  return `${STORAGE_PREFIX}${selfId}|${roomId}`;
}

function toMap(value: unknown): Map<string, number> {
  const entries = new Map<string, number>();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') {
        entries.set(item, 0);
      }
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const [userId, at] of Object.entries(value)) {
      if (typeof at === 'number' && Number.isFinite(at)) {
        entries.set(userId, at);
      }
    }
  }
  return entries;
}

function readStored(key: string): AdminLedger {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (Array.isArray(parsed)) {
      return { promoted: toMap(parsed), departed: new Map() };
    }
    const record = (parsed ?? {}) as { p?: unknown; d?: unknown };
    return { promoted: toMap(record.p), departed: toMap(record.d) };
  } catch {
    return { promoted: new Map(), departed: new Map() };
  }
}

function writeStored(key: string, ledger: AdminLedger): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify({ p: Object.fromEntries(ledger.promoted), d: Object.fromEntries(ledger.departed) }));
  } catch {
    return;
  }
}

function ledgerFor(selfId: string, roomId: string): AdminLedger {
  const key = storageKey(selfId, roomId);
  let ledger = ledgers.get(key);
  if (!ledger) {
    ledger = readStored(key);
    ledgers.set(key, ledger);
  }
  return ledger;
}

export function getVerifiedPromotions(selfId: string, roomId: string): ReadonlySet<string> {
  return new Set(ledgerFor(selfId, roomId).promoted.keys());
}

export function getDepartures(selfId: string, roomId: string): ReadonlyMap<string, number> {
  return ledgerFor(selfId, roomId).departed;
}

export function rememberVerifiedPromotion(selfId: string, roomId: string, userId: string, at: number = Date.now()): void {
  const ledger = ledgerFor(selfId, roomId);
  const departedAt = ledger.departed.get(userId);
  if ((departedAt !== undefined && departedAt >= at) || ledger.promoted.has(userId) || ledger.promoted.size >= MAX_ENTRIES_PER_ROOM) {
    return;
  }
  ledger.promoted.set(userId, at);
  writeStored(storageKey(selfId, roomId), ledger);
}

export function revokeVerifiedPromotion(selfId: string, roomId: string, userId: string, at: number = Date.now()): void {
  const ledger = ledgerFor(selfId, roomId);
  if (ledger.departed.size < MAX_ENTRIES_PER_ROOM || ledger.departed.has(userId)) {
    ledger.departed.set(userId, Math.max(ledger.departed.get(userId) ?? 0, at));
  }
  const promotedAt = ledger.promoted.get(userId);
  if (promotedAt !== undefined && promotedAt <= at) {
    ledger.promoted.delete(userId);
  }
  writeStored(storageKey(selfId, roomId), ledger);
}

export function forgetVerifiedPromotions(): void {
  ledgers.clear();
}
