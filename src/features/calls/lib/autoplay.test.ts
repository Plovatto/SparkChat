import { describe, expect, it } from 'vitest';
import { AutoplayRetry, type InteractionTarget, type PlayableLike } from './autoplay';

function target() {
  const listeners = new Map<string, () => void>();
  const host: InteractionTarget = {
    addEventListener: (type, listener) => void listeners.set(type, listener),
    removeEventListener: (type) => void listeners.delete(type),
  };
  return { host, listeners };
}

function element(results: Array<'ok' | 'blocked' | 'abort'>, tracks = 1) {
  let plays = 0;
  const media: PlayableLike & { plays: () => number } = {
    srcObject: { getTracks: () => Array.from({ length: tracks }) } as unknown as MediaStream,
    play: () => {
      plays += 1;
      const result = results.shift() ?? 'ok';
      if (result === 'ok') {
        return Promise.resolve();
      }
      return Promise.reject(Object.assign(new Error(result), { name: result === 'blocked' ? 'NotAllowedError' : 'AbortError' }));
    },
    plays: () => plays,
  };
  return media;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AutoplayRetry', () => {
  it('never calls play on an element without tracks', () => {
    const { host } = target();
    const retry = new AutoplayRetry(host);
    const empty = element([], 0);
    retry.play(empty);
    retry.play(null);
    expect(empty.plays()).toBe(0);
  });

  it('retries blocked playback silently on the next interaction and removes its listeners', async () => {
    const { host, listeners } = target();
    const retry = new AutoplayRetry(host);
    const media = element(['blocked', 'ok']);
    retry.play(media);
    await flush();
    expect(retry.pending).toBe(1);
    expect([...listeners.keys()].sort()).toEqual(['keydown', 'pointerdown']);

    listeners.get('pointerdown')?.();
    await flush();

    expect(media.plays()).toBe(2);
    expect(retry.pending).toBe(0);
    expect(listeners.size).toBe(0);
  });

  it('ignores interrupted plays instead of treating them as blocked', async () => {
    const { host, listeners } = target();
    const retry = new AutoplayRetry(host);
    retry.play(element(['abort']));
    await flush();
    expect(retry.pending).toBe(0);
    expect(listeners.size).toBe(0);
  });

  it('forgets elements and cleans up on dispose', async () => {
    const { host, listeners } = target();
    const retry = new AutoplayRetry(host);
    const media = element(['blocked']);
    retry.play(media);
    await flush();
    retry.forget(media);
    expect(listeners.size).toBe(0);

    retry.play(element(['blocked']));
    await flush();
    retry.dispose();
    expect(listeners.size).toBe(0);
    expect(retry.pending).toBe(0);
  });
});
