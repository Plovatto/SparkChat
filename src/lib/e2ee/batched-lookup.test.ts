import { describe, expect, it, vi } from 'vitest';
import type { AppSocket } from '@lib/socket';
import { createBatchedLookup, MAX_LOOKUP_BATCH_SIZE } from './batched-lookup';

interface Entry {
  id: string;
  value: string;
}

const socket = {} as AppSocket;

function idsFrom(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `id-${index}`);
}

describe('createBatchedLookup', () => {
  it('coalesces ids requested in the same tick into one request', async () => {
    const fetchBatch = vi.fn((_socket: AppSocket, ids: string[]) => Promise.resolve(ids.map((id) => ({ id, value: `v-${id}` }))));
    const lookup = createBatchedLookup<Entry>(fetchBatch, (entry) => entry.id);

    const results = await Promise.all([lookup(socket, 'a'), lookup(socket, 'b'), lookup(socket, 'a')]);

    expect(fetchBatch).toHaveBeenCalledTimes(1);
    expect(fetchBatch.mock.calls[0]?.[1]).toEqual(['a', 'b']);
    expect(results.map((entry) => entry?.value)).toEqual(['v-a', 'v-b', 'v-a']);
  });

  it('splits more ids than the server accepts into sequential requests of at most the limit', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchBatch = vi.fn(async (_socket: AppSocket, ids: string[]) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return ids.map((id) => ({ id, value: `v-${id}` }));
    });
    const lookup = createBatchedLookup<Entry>(fetchBatch, (entry) => entry.id);
    const ids = idsFrom(MAX_LOOKUP_BATCH_SIZE * 2 + 50);

    const results = await Promise.all(ids.map((id) => lookup(socket, id)));

    expect(fetchBatch.mock.calls.map((call) => call[1].length)).toEqual([MAX_LOOKUP_BATCH_SIZE, MAX_LOOKUP_BATCH_SIZE, 50]);
    expect(maxInFlight).toBe(1);
    expect(results.map((entry) => entry?.value)).toEqual(ids.map((id) => `v-${id}`));
  });

  it('resolves the waiters of a chunk as soon as that chunk answers', async () => {
    const releases: (() => void)[] = [];
    const fetchBatch = vi.fn(
      (_socket: AppSocket, ids: string[]) =>
        new Promise<Entry[]>((resolve) => {
          releases.push(() => resolve(ids.map((id) => ({ id, value: id }))));
        }),
    );
    const lookup = createBatchedLookup<Entry>(fetchBatch, (entry) => entry.id, 2);

    const first = lookup(socket, 'a');
    void lookup(socket, 'b');
    const third = lookup(socket, 'c');
    let thirdResolved = false;
    void third.then(() => {
      thirdResolved = true;
    });

    await vi.waitFor(() => expect(releases).toHaveLength(1));
    releases[0]?.();

    await expect(first).resolves.toEqual({ id: 'a', value: 'a' });
    expect(thirdResolved).toBe(false);

    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases[1]?.();
    await expect(third).resolves.toEqual({ id: 'c', value: 'c' });
  });

  it('resolves null only for the ids of a chunk that failed or had no entry', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchBatch = vi.fn((_socket: AppSocket, ids: string[]) => {
      if (ids.includes('a')) {
        return Promise.reject(new Error('boom'));
      }
      return Promise.resolve(ids.filter((id) => id !== 'd').map((id) => ({ id, value: id })));
    });
    const lookup = createBatchedLookup<Entry>(fetchBatch, (entry) => entry.id, 2);

    const results = await Promise.all(['a', 'b', 'c', 'd'].map((id) => lookup(socket, id)));

    expect(results).toEqual([null, null, { id: 'c', value: 'c' }, null]);
    consoleError.mockRestore();
  });
});
