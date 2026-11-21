import { Suspense, lazy, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type JSX, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '@hooks/useMediaQuery';
import { useAppLanguage } from '@lib/i18n/app-i18n';
import { MOTION_DURATION_MS, usePresence } from '@features/motion';
import { useSheetDrag } from '../hooks/useSheetDrag';
import { useViewportSize } from '../hooks/useViewportSize';
import { emojiDataLocaleFor } from '../utils/emoji-data-source';
import {
  EMOJI_POPOVER_HEIGHT,
  EMOJI_POPOVER_WIDTH,
  EMOJI_SHEET_QUERY,
  emojiColumnsFor,
  emojiSheetHeight,
  emojiSheetWidth,
} from '../utils/picker-layout';
import { computePopoverPosition, type PopoverPosition } from '../utils/popover-position';
import { loadEmojiPickerPanel } from '../utils/load-emoji-picker';
import { EmojiPickerSkeleton } from './EmojiPickerSkeleton';
import '../styles/emoji-picker.css';

const EmojiPickerPanel = lazy(loadEmojiPickerPanel);

export interface EmojiPickerPopoverProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onSelect: (emoji: string) => void;
  onClose: () => void;
  placement?: 'top' | 'bottom';
}

const COARSE_POINTER_QUERY = '(pointer: coarse)';

interface SurfaceProps extends Required<Omit<EmojiPickerPopoverProps, 'open'>> {
  isExiting: boolean;
}

function readAnchor(anchorRef: RefObject<HTMLElement | null>) {
  const rect = anchorRef.current?.getBoundingClientRect();
  return rect ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } : null;
}

function EmojiPickerSurface({ anchorRef, onSelect, onClose, placement, isExiting }: SurfaceProps) {
  const { t } = useTranslation();
  const { language } = useAppLanguage();
  const isSheet = useMediaQuery(EMOJI_SHEET_QUERY);
  const isCoarsePointer = useMediaQuery(COARSE_POINTER_QUERY);
  const viewport = useViewportSize(true);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const drag = useSheetDrag(onClose);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (isSheet) {
      return;
    }
    const update = () => {
      const anchor = readAnchor(anchorRef);
      if (!anchor) {
        return;
      }
      setPosition(
        computePopoverPosition(
          anchor,
          { width: window.innerWidth, height: window.innerHeight },
          { width: EMOJI_POPOVER_WIDTH, height: EMOJI_POPOVER_HEIGHT },
          placement,
        ),
      );
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorRef, isSheet, placement, viewport.width, viewport.height]);

  useEffect(() => {
    if (isExiting) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || surfaceRef.current?.contains(target) || anchorRef.current?.contains(target)) {
        return;
      }
      onCloseRef.current();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [anchorRef, isExiting]);

  const sheetWidth = emojiSheetWidth(viewport.width);
  const panelWidth = isSheet ? sheetWidth : (position?.width ?? EMOJI_POPOVER_WIDTH);
  const columns = emojiColumnsFor(panelWidth, isSheet || isCoarsePointer);
  const exitingClass = isExiting ? ' is-exiting' : '';

  const style: CSSProperties = isSheet
    ? {
        width: `${sheetWidth}px`,
        height: `${emojiSheetHeight(viewport.height)}px`,
        bottom: `${viewport.bottomInset}px`,
        transform: drag.offset > 0 ? `translate3d(0, ${drag.offset}px, 0)` : undefined,
        transition: drag.isDragging ? 'none' : undefined,
      }
    : position
      ? {
          left: `${position.left}px`,
          top: `${position.top}px`,
          width: `${position.width}px`,
          height: `${position.height}px`,
          transformOrigin: `${position.originX}px ${position.placement === 'top' ? '100%' : '0%'}`,
        }
      : { visibility: 'hidden' };

  return createPortal(
    <>
      {isSheet && <div className={`sc-emoji-backdrop${exitingClass}`} aria-hidden="true" data-testid="emoji-picker-backdrop" />}
      <div
        ref={surfaceRef}
        role="dialog"
        aria-labelledby={labelId}
        data-testid="emoji-picker"
        data-layout={isSheet ? 'sheet' : 'popover'}
        data-placement={isSheet ? undefined : position?.placement}
        className={`sc-emoji-surface ${isSheet ? 'is-sheet' : 'is-popover'}${exitingClass}`}
        style={style}
      >
        <span id={labelId} className="sc-sr-only">
          {t('emoji.pickerLabel')}
        </span>
        {isSheet && (
          <div className="sc-emoji-handle" {...drag.handlers} data-testid="emoji-picker-handle">
            <span className="sc-emoji-handle-bar" aria-hidden="true" />
            <button type="button" className="sc-sr-only sc-emoji-handle-close" onClick={onClose}>
              {t('emoji.close')}
            </button>
          </div>
        )}
        <Suspense fallback={<EmojiPickerSkeleton columns={columns} />}>
          <EmojiPickerPanel
            locale={emojiDataLocaleFor(language)}
            columns={columns}
            autoFocusSearch={false}
            onSelect={onSelect}
          />
        </Suspense>
      </div>
    </>,
    document.body,
  );
}

export function EmojiPickerPopover({ open, anchorRef, onSelect, onClose, placement = 'top' }: EmojiPickerPopoverProps): JSX.Element | null {
  const presence = usePresence(open, MOTION_DURATION_MS.fast);

  if (!presence.isPresent || typeof document === 'undefined') {
    return null;
  }

  return (
    <EmojiPickerSurface
      anchorRef={anchorRef}
      onSelect={onSelect}
      onClose={onClose}
      placement={placement}
      isExiting={presence.isExiting}
    />
  );
}
