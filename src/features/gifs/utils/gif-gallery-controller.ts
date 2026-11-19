import type { GifItem, GifPage } from '@lib/api/gifs';

export const GIF_SEARCH_DEBOUNCE_MS = 300;
export const GIF_MAX_PAGE = 50;
export const GIF_QUERY_MAX_LENGTH = 100;

export type GifGalleryPhase = 'loading' | 'ready' | 'error';

export interface GifGalleryState {
  query: string;
  items: GifItem[];
  phase: GifGalleryPhase;
  error: unknown;
  hasNext: boolean;
  isLoadingMore: boolean;
  loadMoreFailed: boolean;
}

export interface GifGallerySource {
  trending: (page: number, signal: AbortSignal) => Promise<GifPage>;
  search: (query: string, page: number, signal: AbortSignal) => Promise<GifPage>;
}

export interface GifGalleryController {
  getState: () => GifGalleryState;
  subscribe: (listener: () => void) => () => void;
  start: () => void;
  setQuery: (value: string) => void;
  loadMore: () => void;
  retry: () => void;
  dispose: () => void;
}

export interface GifGalleryOptions {
  debounceMs?: number;
}

const INITIAL_STATE: GifGalleryState = {
  query: '',
  items: [],
  phase: 'loading',
  error: null,
  hasNext: false,
  isLoadingMore: false,
  loadMoreFailed: false,
};

function mergeItems(current: GifItem[], incoming: GifItem[]): GifItem[] {
  const seen = new Set(current.map((item) => item.id));
  const merged = [...current];
  for (const item of incoming) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}

export function createGifGalleryController(source: GifGallerySource, { debounceMs = GIF_SEARCH_DEBOUNCE_MS }: GifGalleryOptions = {}): GifGalleryController {
  let state: GifGalleryState = INITIAL_STATE;
  let activeQuery = '';
  let page = 0;
  let requestController: AbortController | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();

  const setState = (patch: Partial<GifGalleryState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) {
      listener();
    }
  };

  const fetchPage = (query: string, pageNumber: number, signal: AbortSignal) =>
    query ? source.search(query, pageNumber, signal) : source.trending(pageNumber, signal);

  const clearDebounce = () => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  };

  const abortRequest = () => {
    requestController?.abort();
    requestController = null;
  };

  const hasNextAfter = (result: GifPage) => result.hasNext && result.page < GIF_MAX_PAGE;

  const loadFirstPage = async (query: string) => {
    abortRequest();
    const controller = new AbortController();
    requestController = controller;
    activeQuery = query;
    page = 0;
    setState({ phase: 'loading', items: [], error: null, hasNext: false, isLoadingMore: false, loadMoreFailed: false });
    try {
      const result = await fetchPage(query, 1, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      page = result.page;
      setState({ phase: 'ready', items: mergeItems([], result.items), hasNext: hasNextAfter(result) });
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setState({ phase: 'error', error });
    }
  };

  const loadNextPage = async () => {
    const controller = requestController;
    if (!controller || state.phase !== 'ready' || !state.hasNext || state.isLoadingMore) {
      return;
    }
    setState({ isLoadingMore: true, loadMoreFailed: false });
    try {
      const result = await fetchPage(activeQuery, page + 1, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      page = result.page;
      setState({ items: mergeItems(state.items, result.items), hasNext: hasNextAfter(result), isLoadingMore: false });
    } catch {
      if (controller.signal.aborted) {
        return;
      }
      setState({ isLoadingMore: false, loadMoreFailed: true });
    }
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start: () => {
      clearDebounce();
      void loadFirstPage(state.query.trim());
    },
    setQuery: (value) => {
      const query = value.slice(0, GIF_QUERY_MAX_LENGTH);
      const wasDebouncing = debounceTimer !== null;
      clearDebounce();
      setState({ query });
      const trimmed = query.trim();
      if (!wasDebouncing && trimmed === activeQuery && state.phase !== 'error') {
        return;
      }
      abortRequest();
      setState({ phase: 'loading', items: [], error: null, hasNext: false, isLoadingMore: false, loadMoreFailed: false });
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void loadFirstPage(trimmed);
      }, debounceMs);
    },
    loadMore: () => {
      if (!state.loadMoreFailed) {
        void loadNextPage();
      }
    },
    retry: () => {
      if (state.phase === 'error') {
        clearDebounce();
        void loadFirstPage(activeQuery);
      } else if (state.loadMoreFailed) {
        void loadNextPage();
      }
    },
    dispose: () => {
      clearDebounce();
      abortRequest();
    },
  };
}
