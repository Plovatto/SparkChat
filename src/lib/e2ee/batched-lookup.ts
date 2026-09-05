import type { AppSocket } from '@lib/socket';

type BatchFetcher<TEntry> = (socket: AppSocket, ids: string[]) => Promise<TEntry[]>;
type Waiter<TEntry> = (entry: TEntry | null) => void;

interface PendingBatch<TEntry> {
  socket: AppSocket;
  ids: Set<string>;
  waiters: Map<string, Waiter<TEntry>[]>;
}

// The server answers key lookups on a broadcast event that carries no correlation id, so two
// requests in flight at once would each resolve with whichever response landed first — silently
// handing a room the sealed key that belonged to another one. Every lookup therefore goes through
// one queue: pending ids are coalesced into a single request, only one request is on the wire at a
// time, and each response is redistributed to its waiters strictly by entry id.
export function createBatchedLookup<TEntry>(
  fetchBatch: BatchFetcher<TEntry>,
  getEntryId: (entry: TEntry) => string,
): (socket: AppSocket, id: string) => Promise<TEntry | null> {
  let pending: PendingBatch<TEntry> | null = null;
  let inFlight: Promise<void> = Promise.resolve();

  const flush = (batch: PendingBatch<TEntry>): void => {
    const run = async () => {
      let entries: TEntry[] = [];
      try {
        entries = await fetchBatch(batch.socket, Array.from(batch.ids));
      } catch (error) {
        console.error('[e2e] key lookup failed', error);
      }

      const entryById = new Map(entries.map((entry) => [getEntryId(entry), entry]));
      for (const [id, waiters] of batch.waiters) {
        const entry = entryById.get(id) ?? null;
        for (const resolve of waiters) {
          resolve(entry);
        }
      }
    };

    inFlight = inFlight.then(run, run);
  };

  return (socket: AppSocket, id: string): Promise<TEntry | null> =>
    new Promise((resolve) => {
      if (!pending || pending.socket !== socket) {
        const batch: PendingBatch<TEntry> = { socket, ids: new Set(), waiters: new Map() };
        pending = batch;
        setTimeout(() => {
          if (pending === batch) {
            pending = null;
          }
          flush(batch);
        }, 0);
      }

      pending.ids.add(id);
      const waiters = pending.waiters.get(id) ?? [];
      waiters.push(resolve);
      pending.waiters.set(id, waiters);
    });
}
