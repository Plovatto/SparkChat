import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GifItem, GifPage } from '@lib/api/gifs';
import { createGifGalleryController, GIF_MAX_PAGE, type GifGallerySource } from './gif-gallery-controller';

function item(id: string): GifItem {
  return { id, title: `gif ${id}`, url: `https://static.klipy.com/ii/abcdefgh/1/2/${id}xxxx.webp`, width: 200, height: 150, size: 1000 };
}

function page(ids: string[], pageNumber: number, hasNext: boolean): GifPage {
  return { items: ids.map(item), page: pageNumber, hasNext };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

interface Call {
  kind: 'trending' | 'search';
  query?: string;
  page: number;
  signal: AbortSignal;
  reply: Deferred<GifPage>;
}

function createSource() {
  const calls: Call[] = [];
  const source: GifGallerySource = {
    trending: (pageNumber, signal) => {
      const reply = deferred<GifPage>();
      calls.push({ kind: 'trending', page: pageNumber, signal, reply });
      return reply.promise;
    },
    search: (query, pageNumber, signal) => {
      const reply = deferred<GifPage>();
      calls.push({ kind: 'search', query, page: pageNumber, signal, reply });
      return reply.promise;
    },
  };
  return { calls, source };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('gif gallery controller', () => {
  it('shows popular gifs when it starts', async () => {
    const { calls, source } = createSource();
    const controller = createGifGalleryController(source);

    controller.start();
    expect(controller.getState().phase).toBe('loading');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ kind: 'trending', page: 1 });

    calls[0]?.reply.resolve(page(['1', '2'], 1, true));
    await flush();

    expect(controller.getState()).toMatchObject({ phase: 'ready', hasNext: true });
    expect(controller.getState().items.map((gif) => gif.id)).toEqual(['1', '2']);
  });

  it('waits 300 ms after the last keystroke before searching', async () => {
    const { calls, source } = createSource();
    const controller = createGifGalleryController(source);
    controller.start();
    calls[0]?.reply.resolve(page(['1'], 1, false));
    await flush();

    controller.setQuery('c');
    await vi.advanceTimersByTimeAsync(200);
    controller.setQuery('ca');
    await vi.advanceTimersByTimeAsync(200);
    controller.setQuery('cat');
    await vi.advanceTimersByTimeAsync(299);
    expect(calls).toHaveLength(1);
    expect(controller.getState()).toMatchObject({ query: 'cat', phase: 'loading', items: [] });

    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ kind: 'search', query: 'cat', page: 1 });
  });

  it('cancels the previous request and ignores its late answer', async () => {
    const { calls, source } = createSource();
    const controller = createGifGalleryController(source);
    controller.start();
    calls[0]?.reply.resolve(page(['1'], 1, false));
    await flush();

    controller.setQuery('dog');
    await vi.advanceTimersByTimeAsync(300);
    const dogCall = calls[1];
    controller.setQuery('cat');

    expect(dogCall?.signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    dogCall?.reply.resolve(page(['dog'], 1, false));
    calls[2]?.reply.resolve(page(['cat'], 1, false));
    await flush();

    expect(controller.getState().items.map((gif) => gif.id)).toEqual(['cat']);
  });

  it('goes back to popular gifs when the search is cleared', async () => {
    const { calls, source } = createSource();
    const controller = createGifGalleryController(source);
    controller.start();
    calls[0]?.reply.resolve(page(['1'], 1, false));
    await flush();

    controller.setQuery('cat');
    await vi.advanceTimersByTimeAsync(300);
    controller.setQuery('   ');
    await vi.advanceTimersByTimeAsync(300);

    expect(calls[2]).toMatchObject({ kind: 'trending', page: 1 });
  });

  it('does not search again for the same trimmed term', async () => {
    const { calls, source } = createSource();
    const controller = createGifGalleryController(source);
    controller.start();
    controller.setQuery('cat');
    await vi.advanceTimersByTimeAsync(300);
    calls[1]?.reply.resolve(page(['c'], 1, false));
    await flush();

    controller.setQuery('cat ');
    await vi.advanceTimersByTimeAsync(300);

    expect(calls).toHaveLength(2);
    expect(controller.getState().phase).toBe('ready');
  });

  it('still searches when the term returns to the pending one while typing', async () => {
    const { calls, source } = createSource();
    const controller = createGifGalleryController(source);
    controller.start();
    calls[0]?.reply.resolve(page(['1'], 1, false));
    await flush();

    controller.setQuery('a');
    controller.setQuery('a ');
    await vi.advanceTimersByTimeAsync(300);

    expect(calls[1]).toMatchObject({ kind: 'search', query: 'a' });
  });

  it('loads the next pages until there are no more', async () => {
    const { calls, source } = createSource();
    const controller = createGifGalleryController(source);
    controller.start();
    calls[0]?.reply.resolve(page(['1', '2'], 1, true));
    await flush();

    controller.loadMore();
    controller.loadMore();
    expect(calls).toHaveLength(2);
    expect(controller.getState().isLoadingMore).toBe(true);
    expect(calls[1]).toMatchObject({ kind: 'trending', page: 2 });

    calls[1]?.reply.resolve(page(['2', '3'], 2, false));
    await flush();

    expect(controller.getState().items.map((gif) => gif.id)).toEqual(['1', '2', '3']);
    expect(controller.getState().hasNext).toBe(false);
    controller.loadMore();
    expect(calls).toHaveLength(2);
  });

  it('stops at the last page the api accepts', async () => {
    const { calls, source } = createSource();
    const controller = createGifGalleryController(source);
    controller.start();
    calls[0]?.reply.resolve(page(['1'], GIF_MAX_PAGE, true));
    await flush();

    expect(controller.getState().hasNext).toBe(false);
  });

  it('shows an error that can be retried', async () => {
    const { calls, source } = createSource();
    const controller = createGifGalleryController(source);
    const failure = new Error('providerFailed');
    controller.start();
    calls[0]?.reply.reject(failure);
    await flush();

    expect(controller.getState()).toMatchObject({ phase: 'error', error: failure });

    controller.retry();
    calls[1]?.reply.resolve(page([], 1, false));
    await flush();

    expect(controller.getState()).toMatchObject({ phase: 'ready', items: [], error: null });
  });

  it('does not keep retrying a failed next page until asked', async () => {
    const { calls, source } = createSource();
    const controller = createGifGalleryController(source);
    controller.start();
    calls[0]?.reply.resolve(page(['1'], 1, true));
    await flush();

    controller.loadMore();
    calls[1]?.reply.reject(new Error('rateLimit.gifs'));
    await flush();
    expect(controller.getState().loadMoreFailed).toBe(true);

    controller.loadMore();
    expect(calls).toHaveLength(2);

    controller.retry();
    expect(calls[2]).toMatchObject({ page: 2 });
  });

  it('notifies subscribers and aborts everything when disposed', async () => {
    const { calls, source } = createSource();
    const controller = createGifGalleryController(source);
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    controller.start();
    expect(listener).toHaveBeenCalled();
    controller.setQuery('cat');
    controller.dispose();
    await vi.advanceTimersByTimeAsync(300);

    expect(calls[0]?.signal.aborted).toBe(true);
    expect(calls).toHaveLength(1);
    unsubscribe();
  });
});
