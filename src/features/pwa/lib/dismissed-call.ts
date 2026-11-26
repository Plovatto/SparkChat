import { isSafeId } from '../sw/protocol';

export const DISMISSED_CALL_CACHE = 'sparkchat-dismissed-call-v1';
export const DISMISSED_CALL_TTL_MS = 5 * 60_000;

type CacheHost = Pick<CacheStorage, 'open'>;

function dismissedCallUrl(scope: string, callId: string): string {
  return new URL(`dismissed-call/${callId}`, scope).toString();
}

async function purgeExpired(cache: Cache, now: number): Promise<void> {
  const requests = await cache.keys();
  await Promise.all(
    requests.map(async (request) => {
      const entry = await cache.match(request);
      const body = entry ? ((await entry.json().catch(() => null)) as { expiresAt?: unknown } | null) : null;
      if (typeof body?.expiresAt !== 'number' || body.expiresAt <= now) {
        await cache.delete(request);
      }
    }),
  );
}

export async function rememberDismissedCall(caches: CacheHost, scope: string, callId: string, now: number): Promise<void> {
  if (!isSafeId(callId)) {
    return;
  }
  const cache = await caches.open(DISMISSED_CALL_CACHE);
  await purgeExpired(cache, now);
  await cache.put(dismissedCallUrl(scope, callId), new Response(JSON.stringify({ expiresAt: now + DISMISSED_CALL_TTL_MS }), { headers: { 'Content-Type': 'application/json' } }));
}

export async function isCallDismissed(caches: CacheHost | null, scope: string, callId: string, now: number): Promise<boolean> {
  if (!caches || !isSafeId(callId)) {
    return false;
  }
  try {
    const cache = await caches.open(DISMISSED_CALL_CACHE);
    const entry = await cache.match(dismissedCallUrl(scope, callId));
    if (!entry) {
      return false;
    }
    const body = (await entry.json()) as { expiresAt?: unknown };
    return typeof body.expiresAt === 'number' && body.expiresAt > now;
  } catch {
    return false;
  }
}
