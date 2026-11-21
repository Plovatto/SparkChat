import { Suspense, lazy, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type JSX, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '@hooks/useMediaQuery';
import { useAppLanguage } from '@lib/i18n/app-i18n';
import { MOTION_DURATION_MS, usePresence } from '@features/motion';
import { useSheetDrag } from '../hooks/useSheetDrag';
import { useViewportSize } from '../hooks/useViewportSize';
import { emojiDataLocaleFor } from '../utils/emoji-data-source';
import { lastInputModality, trackInputModality } from '../utils/input-modality';
import { loadEmojiPickerPanel } from '../utils/load-emoji-picker';
import {
  EMOJI_POPOVER_HEIGHT,
  EMOJI_POPOVER_WIDTH,
  EMOJI_SHEET_QUERY,
  computeSheetPlacement,
  emojiColumnsFor,
  emojiSheetWidth,
  type SheetPlacement,
} from '../utils/picker-layout';
import { computePopoverPosition, type AnchorRect, type PopoverPosition } from '../utils/popover-position';
import { EmojiPickerSkeleton } from './EmojiPickerSkeleton';
import '../styles/emoji-picker.css';

const EmojiPickerPanel = lazy(loadEmojiPickerPanel);

trackInputModality();

export interface EmojiPickerPopoverProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onSelect: (emoji: string) => void;
  onClose: () => void;
  placement?: 'top' | 'bottom';
  toggleRefs?: readonly RefObject<HTMLElement | null>[];
}

const COARSE_POINTER_QUERY = '(pointer: coarse)';
const NO_TOGGLE_REFS: readonly RefObject<HTMLElement | null>[] = [];
const MODAL_SELECTOR = '.sc-modal-panel, .sc-modal-backdrop, [aria-modal="true"]';
const FOCUSABLE_SELECTOR = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface SurfaceProps extends Required<Omit<EmojiPickerPopoverProps, 'open'>> {
  isExiting: boolean;
}

function readAnchor(anchorRef: RefObject<HTMLElement | null>): AnchorRect | null {
  const rect = anchorRef.current?.getBoundingClientRect();
  return rect ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } : null;
}

function samePosition(a: PopoverPosition | null, b: PopoverPosition): boolean {
  return a !== null && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height && a.placement === b.placement && a.originX === b.originX;
}

function sameSheet(a: SheetPlacement | null, b: SheetPlacement): boolean {
  return a !== null && a.bottom === b.bottom && a.height === b.height;
}

function isFocusable(element: Element | null): element is HTMLElement {
  return element instanceof HTMLElement && element !== document.body && element.isConnected && element.matches(FOCUSABLE_SELECTOR);
}

function hasOpenModal(): boolean {
  return document.querySelector(MODAL_SELECTOR) !== null;
}

function EmojiPickerSurface({ anchorRef, toggleRefs, onSelect, onClose, placement, isExiting }: SurfaceProps) {
  const { t } = useTranslation();
  const { language } = useAppLanguage();
  const isSheet = useMediaQuery(EMOJI_SHEET_QUERY);
  const isCoarsePointer = useMediaQuery(COARSE_POINTER_QUERY);
  const viewport = useViewportSize(true);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const [sheet, setSheet] = useState<SheetPlacement | null>(null);
  const [autoFocusSearch] = useState(() => !isCoarsePointer || lastInputModality() === 'keyboard');
  const [returnFocusTo] = useState<Element | null>(() => (typeof document === 'undefined' ? null : document.activeElement));
  const drag = useSheetDrag(onClose);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const anchor = readAnchor(anchorRef);
      if (isSheet) {
        const next = computeSheetPlacement(anchor, window.innerHeight, viewport.bottomInset);
        setSheet((current) => (sameSheet(current, next) ? current : next));
        return;
      }
      if (!anchor) {
        return;
      }
      const next = computePopoverPosition(
        anchor,
        { width: window.innerWidth, height: window.innerHeight },
        { width: EMOJI_POPOVER_WIDTH, height: EMOJI_POPOVER_HEIGHT },
        placement,
      );
      setPosition((current) => (samePosition(current, next) ? current : next));
    };
    const schedule = (event?: Event) => {
      const target = event?.target;
      if (target instanceof Node && surfaceRef.current?.contains(target)) {
        return;
      }
      if (frame === 0) {
        frame = window.requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    return () => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [anchorRef, isSheet, placement, viewport.width, viewport.height, viewport.bottomInset]);

  useEffect(() => {
    if (isExiting) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      onCloseRef.current();
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        !target ||
        surfaceRef.current?.contains(target) ||
        anchorRef.current?.contains(target) ||
        toggleRefs.some((ref) => ref.current?.contains(target))
      ) {
        return;
      }
      onCloseRef.current();
    };
    const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => {
      if (hasOpenModal()) {
        onCloseRef.current();
      }
    });
    observer?.observe(document.body, { childList: true });
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      observer?.disconnect();
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [anchorRef, toggleRefs, isExiting]);

  useEffect(() => {
    if (!isExiting) {
      return;
    }
    const active = document.activeElement;
    const focusLeftPicker = !active || active === document.body || Boolean(surfaceRef.current?.contains(active));
    if (!focusLeftPicker) {
      return;
    }
    if (isFocusable(returnFocusTo)) {
      returnFocusTo.focus({ preventScroll: true });
      return;
    }
    const anchor = anchorRef.current;
    const fallback = anchor?.matches(FOCUSABLE_SELECTOR) ? anchor : anchor?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    fallback?.focus({ preventScroll: true });
  }, [isExiting, anchorRef, returnFocusTo]);

  const sheetWidth = emojiSheetWidth(viewport.width);
  const panelWidth = isSheet ? sheetWidth : (position?.width ?? EMOJI_POPOVER_WIDTH);
  const columns = emojiColumnsFor(panelWidth, isSheet || isCoarsePointer);
  const exitingClass = isExiting ? ' is-exiting' : '';

  const panel = (
    <Suspense fallback={<EmojiPickerSkeleton columns={columns} />}>
      <EmojiPickerPanel
        locale={emojiDataLocaleFor(language)}
        columns={columns}
        autoFocusSearch={autoFocusSearch}
        onSelect={onSelect}
        onClose={onClose}
      />
    </Suspense>
  );

  const label = (
    <span id={labelId} className="sc-sr-only">
      {t('emoji.pickerLabel')}
    </span>
  );

  if (isSheet) {
    const frameStyle: CSSProperties = sheet ? { bottom: `${sheet.bottom}px` } : { visibility: 'hidden' };
    const sheetStyle: CSSProperties = {
      width: `${sheetWidth}px`,
      height: `${sheet?.height ?? 0}px`,
      transform: drag.offset > 0 ? `translate3d(0, ${drag.offset}px, 0)` : undefined,
      transition: drag.isDragging ? 'none' : undefined,
    };
    return createPortal(
      <div className={`sc-emoji-sheet-frame${exitingClass}`} style={frameStyle} data-testid="emoji-picker-frame">
        <div className={`sc-emoji-backdrop${exitingClass}`} aria-hidden="true" data-testid="emoji-picker-backdrop" />
        <div
          ref={surfaceRef}
          role="dialog"
          aria-labelledby={labelId}
          data-testid="emoji-picker"
          data-layout="sheet"
          data-docked={sheet && sheet.bottom > viewport.bottomInset ? 'anchor' : 'viewport'}
          className={`sc-emoji-surface is-sheet${exitingClass}`}
          style={sheetStyle}
        >
          {label}
          <div className="sc-emoji-handle" {...drag.handlers} data-testid="emoji-picker-handle">
            <span className="sc-emoji-handle-bar" aria-hidden="true" />
          </div>
          {panel}
        </div>
      </div>,
      document.body,
    );
  }

  const popoverStyle: CSSProperties = position
    ? {
        left: `${position.left}px`,
        top: `${position.top}px`,
        width: `${position.width}px`,
        height: `${position.height}px`,
        transformOrigin: `${position.originX}px ${position.placement === 'top' ? '100%' : '0%'}`,
      }
    : { visibility: 'hidden' };

  return createPortal(
    <div
      ref={surfaceRef}
      role="dialog"
      aria-labelledby={labelId}
      data-testid="emoji-picker"
      data-layout="popover"
      data-placement={position?.placement}
      className={`sc-emoji-surface is-popover${exitingClass}`}
      style={popoverStyle}
    >
      {label}
      {panel}
    </div>,
    document.body,
  );
}

export function EmojiPickerPopover({ open, anchorRef, onSelect, onClose, placement = 'top', toggleRefs = NO_TOGGLE_REFS }: EmojiPickerPopoverProps): JSX.Element | null {
  const presence = usePresence(open, MOTION_DURATION_MS.fast);

  if (!presence.isPresent || typeof document === 'undefined') {
    return null;
  }

  return (
    <EmojiPickerSurface
      anchorRef={anchorRef}
      toggleRefs={toggleRefs}
      onSelect={onSelect}
      onClose={onClose}
      placement={placement}
      isExiting={presence.isExiting}
    />
  );
}
