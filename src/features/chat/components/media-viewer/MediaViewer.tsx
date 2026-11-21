import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { LuChevronLeft, LuChevronRight, LuCopy, LuDownload, LuEllipsisVertical, LuForward, LuMessageSquare, LuMinus, LuPlus, LuX } from 'react-icons/lu';
import { Spinner } from '@components/common/Spinner';
import { MOTION_DURATION_MS, usePresence } from '@features/motion';
import { Avatar } from '@features/profile-photos/components/Avatar';
import { useBodyScrollLock } from '@hooks/useBodyScrollLock';
import { useClipboardCopy } from '@hooks/useClipboardCopy';
import { decryptMediaContentIfNeeded, downloadMessageMedia } from '@lib/e2ee';
import { formatAudioTime, formatDayLabel, formatTime } from '@lib/format';
import { toLocalMediaUrl } from '../../utils/safe-media-url';
import { GalleryMediaTile } from '../GalleryMediaTile';
import { clampViewerIndex, type MediaViewerItem } from './media-viewer-items';
import '../../styles/media-viewer.css';

interface MediaViewerProps {
  isOpen: boolean;
  items: MediaViewerItem[];
  startIndex: number;
  onClose: () => void;
  roomName?: string;
  onForward?: (messageId: string) => void;
  onShowInChat?: (messageId: string) => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;
const DOUBLE_TAP_ZOOM = 2;
const SWIPE_THRESHOLD_PX = 60;
const DOUBLE_TAP_MS = 280;
const COPY_KEY_CAPTION = 'caption';

interface MediaDetails {
  width: number;
  height: number;
  duration: number | null;
}

function useResolvedMediaUrl(item: MediaViewerItem | undefined, isOpen: boolean): string | null | undefined {
  const [resolved, setResolved] = useState<Record<string, string | null>>({});
  const key = item?.id;

  useEffect(() => {
    if (!isOpen || !item || item.kind !== 'image' || resolved[item.id] !== undefined) {
      return;
    }
    let cancelled = false;
    void decryptMediaContentIfNeeded(item.content, { roomId: item.roomId, messageId: item.id, fileMeta: item.fileMeta, messageType: 'image' })
      .then((url) => {
        if (!cancelled) {
          setResolved((previous) => ({ ...previous, [item.id]: url ?? null }));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolved((previous) => ({ ...previous, [item.id]: null }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, item, resolved]);

  if (!item || !key) {
    return undefined;
  }
  if (item.kind === 'video') {
    return toLocalMediaUrl(item.content) ?? null;
  }
  const value = resolved[key];
  return value === undefined ? undefined : (toLocalMediaUrl(value ?? undefined) ?? null);
}

export function MediaViewer({ isOpen, items, startIndex, onClose, roomName, onForward, onShowInChat }: MediaViewerProps) {
  const { t } = useTranslation();
  const clipboard = useClipboardCopy();
  const { isPresent, isExiting } = usePresence(isOpen, MOTION_DURATION_MS.normal);
  const [index, setIndex] = useState(() => clampViewerIndex(startIndex, items.length));
  const [direction, setDirection] = useState<'next' | 'previous' | 'none'>('none');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [details, setDetails] = useState<Record<string, MediaDetails>>({});
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [wasOpen, setWasOpen] = useState(isOpen);
  const lastItemsRef = useRef<MediaViewerItem[]>(items);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<{ x: number; y: number; panX: number; panY: number; pointerId: number; moved: boolean } | null>(null);
  const lastTapRef = useRef(0);
  useBodyScrollLock(isOpen);

  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setIndex(clampViewerIndex(startIndex, items.length));
      setDirection('none');
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setIsMenuOpen(false);
    }
  }

  if (isOpen && items.length > 0) {
    lastItemsRef.current = items;
  }
  const visibleItems = isOpen ? items : lastItemsRef.current;
  const safeIndex = clampViewerIndex(index, visibleItems.length);
  const item = visibleItems[safeIndex];
  const mediaUrl = useResolvedMediaUrl(item, isOpen);
  const hasMultiple = visibleItems.length > 1;
  const canZoom = item?.kind === 'image';
  const itemDetails = item ? details[item.id] : undefined;

  const goTo = useCallback(
    (nextIndex: number) => {
      const target = clampViewerIndex(nextIndex, items.length);
      if (target === safeIndex) {
        return;
      }
      setDirection(target > safeIndex ? 'next' : 'previous');
      setIndex(target);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setIsMenuOpen(false);
    },
    [items.length, safeIndex],
  );

  const changeZoom = useCallback((delta: number) => {
    setZoom((previous) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((previous + delta) * 100) / 100));
      if (next === MIN_ZOOM) {
        setPan({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    closeButtonRef.current?.focus({ preventScroll: true });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (isMenuOpen) {
          setIsMenuOpen(false);
        } else {
          onClose();
        }
      } else if (event.key === 'ArrowLeft') {
        goTo(safeIndex - 1);
      } else if (event.key === 'ArrowRight') {
        goTo(safeIndex + 1);
      } else if ((event.key === '+' || event.key === '=') && canZoom) {
        changeZoom(ZOOM_STEP);
      } else if (event.key === '-' && canZoom) {
        changeZoom(-ZOOM_STEP);
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, isMenuOpen, onClose, goTo, safeIndex, canZoom, changeZoom]);

  useEffect(() => {
    const strip = stripRef.current;
    const active = strip?.querySelector<HTMLElement>('[data-active="true"]');
    if (strip && active) {
      strip.scrollTo({ left: active.offsetLeft - strip.clientWidth / 2 + active.clientWidth / 2, behavior: 'smooth' });
    }
  }, [safeIndex, isOpen]);

  if (!isPresent || !item) {
    return null;
  }

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!canZoom) {
      return;
    }
    changeZoom(event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    gestureRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y, pointerId: event.pointerId, moved: false };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      gesture.moved = true;
    }
    if (zoom > 1) {
      setPan({ x: gesture.panX + dx, y: gesture.panY + dy });
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - gesture.x;
    if (zoom === 1 && Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(event.clientY - gesture.y)) {
      goTo(safeIndex + (dx < 0 ? 1 : -1));
      return;
    }
    if (!gesture.moved && canZoom) {
      const now = Date.now();
      if (now - lastTapRef.current < DOUBLE_TAP_MS) {
        lastTapRef.current = 0;
        setZoom((previous) => (previous > 1 ? 1 : DOUBLE_TAP_ZOOM));
        setPan({ x: 0, y: 0 });
      } else {
        lastTapRef.current = now;
      }
    }
  };

  const handleDownload = () => {
    void downloadMessageMedia({
      content: item.content,
      roomId: item.roomId,
      messageId: item.id,
      fileMeta: item.fileMeta,
      fileName: item.fileMeta?.name ?? (item.kind === 'video' ? t('chat.message.defaultVideoName') : t('chat.message.defaultFileName')),
      messageType: item.kind === 'image' ? 'image' : 'file',
    });
  };

  const kindLabel = item.isGif ? t('chat.viewer.gif') : item.kind === 'video' ? t('chat.viewer.video') : t('chat.viewer.photo');
  const detailLabel = itemDetails
    ? item.kind === 'video' && itemDetails.duration
      ? formatAudioTime(itemDetails.duration)
      : `${itemDetails.width} × ${itemDetails.height}`
    : null;
  const sentAt = new Date(item.timestamp);
  const metaLine = [`${formatDayLabel(sentAt)}, ${formatTime(item.timestamp)}`, roomName].filter(Boolean).join(' · ');
  const stateClassName = isExiting ? ' is-exiting' : '';

  const actionButtons = (
    <>
      {onForward && (
        <button type="button" className="sc-viewer__tool" onClick={() => onForward(item.id)} title={t('chat.viewer.forward')} aria-label={t('chat.viewer.forward')}>
          <LuForward size={18} aria-hidden="true" />
        </button>
      )}
      <button type="button" className="sc-viewer__tool" onClick={handleDownload} title={t('chat.viewer.download')} aria-label={t('chat.viewer.download')}>
        <LuDownload size={18} aria-hidden="true" />
      </button>
      {(onShowInChat || item.caption) && (
        <div className="sc-viewer__menu-anchor">
          <button
            type="button"
            className="sc-viewer__tool"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            title={t('chat.viewer.more')}
            aria-label={t('chat.viewer.more')}
          >
            <LuEllipsisVertical size={18} aria-hidden="true" />
          </button>
          {isMenuOpen && (
            <div className="sc-viewer__menu" role="menu">
              {onShowInChat && (
                <button
                  type="button"
                  role="menuitem"
                  className="sc-viewer__menu-item"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onShowInChat(item.id);
                  }}
                >
                  <LuMessageSquare size={16} aria-hidden="true" />
                  {t('chat.viewer.showInChat')}
                </button>
              )}
              {item.caption && (
                <button
                  type="button"
                  role="menuitem"
                  className="sc-viewer__menu-item"
                  onClick={() => {
                    setIsMenuOpen(false);
                    clipboard.copy(item.caption ?? '', COPY_KEY_CAPTION);
                  }}
                >
                  <LuCopy size={16} aria-hidden="true" />
                  {clipboard.isCopied(COPY_KEY_CAPTION) ? t('chat.viewer.captionCopied') : t('chat.viewer.copyCaption')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );

  return createPortal(
    <div className={`sc-viewer${stateClassName}`} role="dialog" aria-modal="true" aria-label={kindLabel}>
      <div className="sc-viewer__backdrop" onClick={onClose} />

      <header className="sc-viewer__top">
        <div className="sc-viewer__author">
          <Avatar userId={item.senderId} avatarIndex={item.senderAvatar} tone="soft" size={40} iconSize={18} />
          <div className="sc-viewer__author-text">
            <span className="sc-viewer__author-name">{item.senderName}</span>
            <span className="sc-viewer__author-meta">{metaLine}</span>
          </div>
        </div>
        <div className="sc-viewer__toolbar">
          {canZoom && (
            <div className="sc-viewer__zoom">
              <button type="button" className="sc-viewer__tool" onClick={() => changeZoom(-ZOOM_STEP)} disabled={zoom <= MIN_ZOOM} title={t('chat.viewer.zoomOut')} aria-label={t('chat.viewer.zoomOut')}>
                <LuMinus size={18} aria-hidden="true" />
              </button>
              <span className="sc-viewer__zoom-value" aria-live="polite">
                {Math.round(zoom * 100)}%
              </span>
              <button type="button" className="sc-viewer__tool" onClick={() => changeZoom(ZOOM_STEP)} disabled={zoom >= MAX_ZOOM} title={t('chat.viewer.zoomIn')} aria-label={t('chat.viewer.zoomIn')}>
                <LuPlus size={18} aria-hidden="true" />
              </button>
              <span className="sc-viewer__divider" aria-hidden="true" />
            </div>
          )}
          <div className="sc-viewer__actions">{actionButtons}</div>
          <span className="sc-viewer__divider sc-viewer__divider--close" aria-hidden="true" />
          <button ref={closeButtonRef} type="button" className="sc-viewer__close" onClick={onClose} title={t('chat.viewer.close')} aria-label={t('chat.viewer.close')}>
            <LuX size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      {hasMultiple && (
        <>
          <button type="button" className="sc-viewer__nav sc-viewer__nav--previous" onClick={() => goTo(safeIndex - 1)} disabled={safeIndex === 0} title={t('chat.viewer.previousMedia')} aria-label={t('chat.viewer.previousMedia')}>
            <LuChevronLeft size={22} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="sc-viewer__nav sc-viewer__nav--next"
            onClick={() => goTo(safeIndex + 1)}
            disabled={safeIndex === visibleItems.length - 1}
            title={t('chat.viewer.nextMedia')}
            aria-label={t('chat.viewer.nextMedia')}
          >
            <LuChevronRight size={22} aria-hidden="true" />
          </button>
        </>
      )}

      <main className="sc-viewer__stage">
        <div
          key={item.id}
          className="sc-viewer__frame"
          data-direction={direction}
          data-zoomed={zoom > 1}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            gestureRef.current = null;
          }}
        >
          {mediaUrl === undefined && (
            <div className="sc-viewer__loading">
              <Spinner size={30} />
            </div>
          )}
          {mediaUrl === null && <div className="sc-viewer__loading">{t('chat.viewer.unavailable')}</div>}
          {mediaUrl && item.kind === 'image' && (
            <img
              src={mediaUrl}
              alt={item.caption ?? kindLabel}
              className="sc-viewer__media"
              draggable={false}
              style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}
              onLoad={(event) => {
                const { naturalWidth, naturalHeight } = event.currentTarget;
                setDetails((previous) => ({ ...previous, [item.id]: { width: naturalWidth, height: naturalHeight, duration: null } }));
              }}
            />
          )}
          {mediaUrl && item.kind === 'video' && (
            <video
              src={mediaUrl}
              className="sc-viewer__media"
              controls
              autoPlay
              playsInline
              onLoadedMetadata={(event) => {
                const { videoWidth, videoHeight, duration } = event.currentTarget;
                setDetails((previous) => ({
                  ...previous,
                  [item.id]: { width: videoWidth, height: videoHeight, duration: Number.isFinite(duration) ? duration : null },
                }));
              }}
            />
          )}
          <span className="sc-viewer__badge">
            {kindLabel}
            {detailLabel && <span className="sc-viewer__badge-detail"> · {detailLabel}</span>}
          </span>
        </div>

        {item.caption && (
          <p key={`${item.id}-caption`} className="sc-viewer__caption">
            {item.caption}
          </p>
        )}
      </main>

      <footer className="sc-viewer__bottom">
        {hasMultiple && (
          <>
            <span className="sc-viewer__counter">{t('chat.viewer.counter', { current: safeIndex + 1, total: visibleItems.length })}</span>
            <div ref={stripRef} className="sc-viewer__strip" role="tablist" aria-label={t('chat.viewer.thumbnails')}>
              {visibleItems.map((candidate, candidateIndex) => (
                <button
                  key={candidate.id}
                  type="button"
                  role="tab"
                  aria-selected={candidateIndex === safeIndex}
                  data-active={candidateIndex === safeIndex}
                  className="sc-viewer__thumb"
                  onClick={() => goTo(candidateIndex)}
                  aria-label={t('chat.viewer.counter', { current: candidateIndex + 1, total: visibleItems.length })}
                >
                  <GalleryMediaTile message={candidate.message} />
                </button>
              ))}
            </div>
          </>
        )}
        <div className="sc-viewer__mobile-actions">{actionButtons}</div>
      </footer>
    </div>,
    document.body,
  );
}
