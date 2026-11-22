import { isSafeId } from '../sw/protocol';

export const ARMED_ANSWER_CACHE = 'sparkchat-armed-answer-v1';
export const ARMED_ANSWER_TTL_MS = 60_000;

type CacheHost = Pick<CacheStorage, 'open'>;

function armedAnswerUrl(scope: string, callId: string): string {
  return new URL(`armed-answer/${callId}`, scope).toString();
}

export async function armCallAnswer(caches: CacheHost, scope: string, callId: string, now: number): Promise<void> {
  if (!isSafeId(callId)) {
    return;
  }
  const cache = await caches.open(ARMED_ANSWER_CACHE);
  await cache.put(armedAnswerUrl(scope, callId), new Response(JSON.stringify({ expiresAt: now + ARMED_ANSWER_TTL_MS }), { headers: { 'Content-Type': 'application/json' } }));
}

export async function consumeArmedAnswer(caches: CacheHost | null, scope: string, callId: string, now: number): Promise<boolean> {
  if (!caches || !isSafeId(callId)) {
    return false;
  }
  try {
    const cache = await caches.open(ARMED_ANSWER_CACHE);
    const url = armedAnswerUrl(scope, callId);
    const entry = await cache.match(url);
    if (!entry) {
      return false;
    }
    await cache.delete(url);
    const body = (await entry.json()) as { expiresAt?: unknown };
    return typeof body.expiresAt === 'number' && body.expiresAt > now;
  } catch {
    return false;
  }
}
