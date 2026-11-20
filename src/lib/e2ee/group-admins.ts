const STORAGE_PREFIX = 'sparkchat:verified-promotions:';
const MAX_PROMOTIONS_PER_ROOM = 500;

const promotions = new Map<string, Set<string>>();

function storageKey(selfId: string, roomId: string): string {
  return `${STORAGE_PREFIX}${selfId}|${roomId}`;
}

function readStored(key: string): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function writeStored(key: string, values: Set<string>): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(Array.from(values)));
  } catch {
    return;
  }
}

export function getVerifiedPromotions(selfId: string, roomId: string): ReadonlySet<string> {
  const key = storageKey(selfId, roomId);
  let known = promotions.get(key);
  if (!known) {
    known = new Set(readStored(key).slice(0, MAX_PROMOTIONS_PER_ROOM));
    promotions.set(key, known);
  }
  return known;
}

export function rememberVerifiedPromotion(selfId: string, roomId: string, userId: string): void {
  const key = storageKey(selfId, roomId);
  const known = new Set(getVerifiedPromotions(selfId, roomId));
  if (known.has(userId) || known.size >= MAX_PROMOTIONS_PER_ROOM) {
    return;
  }
  known.add(userId);
  promotions.set(key, known);
  writeStored(key, known);
}

export function forgetVerifiedPromotions(): void {
  promotions.clear();
}
