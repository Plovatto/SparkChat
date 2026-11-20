import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { FaRedo, FaSearch, FaTimes } from 'react-icons/fa';
import { useTheme } from '@features/theme';
import { translateError } from '@lib/api/api-error';
import type { GifItem, GifLocale } from '@lib/api/gifs';
import type { SessionAuth } from '@lib/api/session-auth';
import { useElementWidth } from '../hooks/useElementWidth';
import { useGifGallery } from '../hooks/useGifGallery';
import { consumeEscape } from '../utils/escape-key';
import { GIF_QUERY_MAX_LENGTH } from '../utils/gif-gallery-controller';
import { gifColumnCount, isGridKey, layoutMasonry, moveInMasonry } from '../utils/masonry-layout';
import { GifTile } from './GifTile';

const GIF_SEARCH_HEIGHT = 42;

export const KLIPY_SEARCH_PLACEHOLDER = 'Search KLIPY';
export const KLIPY_ATTRIBUTION = 'Powered by KLIPY';

const SKELETON_TILES = [1.2, 0.8, 1, 0.7, 1.1, 0.9];

interface GifPanelProps {
  auth: SessionAuth;
  locale: GifLocale;
  onPick: (blob: Blob) => void;
  onClose: () => void;
  onDismiss?: () => void;
  ignoreOutsideRef?: RefObject<HTMLElement | null>;
  autoFocusSearch?: boolean;
  isExiting?: boolean;
}

export function GifPanel({ auth, locale, onPick, onClose, onDismiss, ignoreOutsideRef, autoFocusSearch = true, isExiting = false }: GifPanelProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { state, controller } = useGifGallery(auth, locale);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef(new Map<number, HTMLButtonElement>());
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [notReadyNotice, setNotReadyNotice] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const gridWidth = useElementWidth(gridRef);
  const columnCount = gifColumnCount(gridWidth);
  const layout = useMemo(() => layoutMasonry(state.items, columnCount), [state.items, columnCount]);
  const { items, phase, hasNext, isLoadingMore, loadMoreFailed } = state;

  const dismiss = onDismiss ?? onClose;

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      consumeEscape(event, dismiss);
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [dismiss]);

  useEffect(() => {
    if (autoFocusSearch) {
      searchRef.current?.focus();
    }
  }, [autoFocusSearch]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || panelRef.current?.contains(target) || ignoreOutsideRef?.current?.contains(target)) {
        return;
      }
      onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [onClose, ignoreOutsideRef]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !scrollRoot || phase !== 'ready' || !hasNext || typeof IntersectionObserver === 'undefined') {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          controller.loadMore();
        }
      },
      { root: scrollRoot, rootMargin: '200px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [controller, scrollRoot, phase, hasNext, items.length]);

  useEffect(() => {
    setFocusIndex(0);
  }, [state.query]);

  const registerTile = useCallback((index: number, element: HTMLButtonElement | null) => {
    if (element) {
      tileRefs.current.set(index, element);
    } else {
      tileRefs.current.delete(index);
    }
  }, []);

  const focusTile = useCallback((index: number) => {
    setFocusIndex(index);
    tileRefs.current.get(index)?.focus();
  }, []);

  const handlePick = useCallback(
    (item: GifItem, displayedBlob: Blob | null) => {
      const blob = displayedBlob;
      if (!blob) {
        setNotReadyNotice(true);
        return;
      }
      setPickedId(item.id);
      onPick(blob);
      onClose();
    },
    [onPick, onClose],
  );

  const handleTileKeyDown = useCallback(
    (index: number, event: KeyboardEvent<HTMLButtonElement>) => {
      if (!isGridKey(event.key)) {
        return;
      }
      event.preventDefault();
      const next = moveInMasonry(layout, index, event.key);
      if (next !== null) {
        focusTile(next);
      } else if (event.key === 'ArrowUp') {
        searchRef.current?.focus();
      }
    },
    [layout, focusTile],
  );

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && items.length > 0) {
      event.preventDefault();
      focusTile(Math.min(focusIndex, items.length - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
    }
  };

  const renderColumns = () => (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
      {layout.columns.map((column, columnIndex) => (
        <div key={columnIndex} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {column.map((index) => {
            const item = items[index];
            return item ? (
              <GifTile
                key={item.id}
                item={item}
                index={index}
                auth={auth}
                scrollRoot={scrollRoot}
                isFocusTarget={index === focusIndex}
                isPicked={item.id === pickedId}
                onPick={handlePick}
                onKeyNavigate={handleTileKeyDown}
                registerTile={registerTile}
              />
            ) : null;
          })}
        </div>
      ))}
    </div>
  );

  const renderSkeleton = () => (
    <div data-testid="gif-loading" aria-busy="true" className="sc-anim-fade-in" style={{ display: 'flex', gap: '6px' }}>
      {[0, 1].map((columnIndex) => (
        <div key={columnIndex} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {SKELETON_TILES.filter((_, index) => index % 2 === columnIndex).map((ratio, index) => (
            <div key={index} className="shimmer-bg" style={{ width: '100%', aspectRatio: `1 / ${ratio}`, borderRadius: '10px', background: theme.skeleton }} />
          ))}
        </div>
      ))}
      <span className="sc-sr-only">{t('gifs.loading')}</span>
    </div>
  );

  const renderMessage = (testId: string, text: string, withRetry: boolean) => (
    <div
      data-testid={testId}
      role={withRetry ? 'alert' : 'status'}
      className="sc-anim-rise-in"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '32px 12px', textAlign: 'center', color: theme.textSecondary, fontSize: '0.85rem' }}
    >
      <span>{text}</span>
      {withRetry && (
        <button type="button" onClick={controller.retry} className="sc-btn sc-btn--soft" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
          <FaRedo size={11} />
          {t('gifs.retry')}
        </button>
      )}
    </div>
  );

  const renderBody = () => {
    if (phase === 'loading') {
      return renderSkeleton();
    }
    if (phase === 'error') {
      return renderMessage('gif-error', translateError(state.error, 'gifs.loadFailed'), true);
    }
    if (items.length === 0) {
      return renderMessage('gif-empty', t('gifs.empty'), false);
    }
    return (
      <>
        {renderColumns()}
        <div ref={sentinelRef} style={{ height: '1px' }} />
        {isLoadingMore && <div className="shimmer-bg" style={{ height: '6px', margin: '8px 25%', borderRadius: '999px', background: theme.skeleton }} />}
        {loadMoreFailed && renderMessage('gif-load-more-error', t('gifs.loadMoreFailed'), true)}
      </>
    );
  };

  return (
    <div
      ref={panelRef}
      data-testid="gif-panel"
      role="dialog"
      aria-label={t('gifs.panelLabel')}
      className={`chat-preview-bar sc-gif-panel${isExiting ? ' is-exiting' : ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        height: 'clamp(240px, 45vh, 380px)',
        background: theme.surface,
        borderTop: `1px solid ${theme.border}`,
        paddingBottom: '18px',
        boxSizing: 'border-box',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <FaSearch
            size={12}
            aria-hidden="true"
            style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: theme.textMuted, pointerEvents: 'none' }}
          />
          <input
            ref={searchRef}
            type="search"
            data-testid="gif-search-input"
            value={state.query}
            onChange={(event) => {
              setNotReadyNotice(false);
              controller.setQuery(event.target.value);
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder={KLIPY_SEARCH_PLACEHOLDER}
            aria-label={t('gifs.searchLabel')}
            maxLength={GIF_QUERY_MAX_LENGTH}
            enterKeyHint="search"
            autoComplete="off"
            className="sc-input sc-input--composer"
            style={{ height: `${GIF_SEARCH_HEIGHT}px`, padding: '0 18px 0 34px', width: '100%', boxSizing: 'border-box' }}
          />
        </div>
        <button
          type="button"
          onClick={dismiss}
          title={t('gifs.close')}
          aria-label={t('gifs.close')}
          data-testid="gif-panel-close"
          className="sc-icon-btn sc-icon-btn--muted"
          style={{ width: `${GIF_SEARCH_HEIGHT}px`, height: `${GIF_SEARCH_HEIGHT}px`, borderRadius: '50%', flexShrink: 0 }}
        >
          <FaTimes size={14} />
        </button>
      </div>
      <div
        ref={setScrollRoot}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', borderRadius: '10px' }}
      >
        <div ref={gridRef} aria-label={phase === 'ready' && !state.query.trim() ? t('gifs.trending') : t('gifs.results')} role="group">
          {renderBody()}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', minWidth: 0 }}>
        <span role="status" aria-live="polite" style={{ fontSize: '0.72rem', color: theme.textSecondary, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {notReadyNotice ? t('gifs.notReady') : ''}
        </span>
        <span data-testid="gif-attribution" style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.02em', color: theme.textMuted, flexShrink: 0 }}>
          {KLIPY_ATTRIBUTION}
        </span>
      </div>
    </div>
  );
}
