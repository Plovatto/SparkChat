import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { LuCircleCheck, LuCopy, LuEllipsisVertical, LuForward, LuLanguages, LuReply, LuSmilePlus, LuTrash2 } from 'react-icons/lu';
import { MOTION_DURATION_MS, usePresence } from '@features/motion';
import { useEscapeKey } from '@hooks/useEscapeKey';
import { useBackdropDismiss } from '@hooks/useBackdropDismiss';
import { useMediaQuery } from '@hooks/useMediaQuery';
import { useOutsidePointerDown } from '@hooks/useOutsidePointerDown';
import '../styles/message-actions.css';

export const MESSAGE_ACTIONS_SHEET_QUERY = '(max-width: 767.98px), (hover: none)';
const SHEET_DISMISS_DISTANCE = 110;
const SHEET_DISMISS_VELOCITY = 0.6;

const POPOVER_GAP_PX = 8;
const POPOVER_EDGE_PX = 12;

interface MessageActionsRowProps {
  isOwn: boolean;
  isExiting?: boolean;
  canDelete?: boolean;
  canCopy?: boolean;
  canTranslate?: boolean;
  sheetHeader?: ReactNode;
  onReply?: () => void;
  onDelete: () => void;
  onForward?: () => void;
  onCopy?: () => void;
  onTranslate?: () => void;
  onStartSelection?: (() => void) | undefined;
  onReact?: (() => void) | undefined;
  reactButtonRef?: RefObject<HTMLButtonElement | null>;
  isReactionOpen?: boolean;
  reactionPopover?: ReactNode;
  onDismiss?: () => void;
}

interface ActionItem {
  key: string;
  icon: ReactNode;
  label: string;
  onSelect: () => void;
  tone?: 'danger';
  keepsSelection?: boolean;
}

function useActionItems({ canDelete = true, canCopy, canTranslate, onReply, onForward, onCopy, onTranslate, onStartSelection, onDelete }: MessageActionsRowProps) {
  const { t } = useTranslation();
  const primary: ActionItem[] = [];
  if (onReply) {
    primary.push({ key: 'reply', icon: <LuReply size={18} />, label: t('chat.message.reply'), onSelect: onReply });
  }
  if (onForward) {
    primary.push({ key: 'forward', icon: <LuForward size={18} />, label: t('chat.message.forward'), onSelect: onForward });
  }
  const secondary: ActionItem[] = [];
  if (canCopy && onCopy) {
    secondary.push({ key: 'copy', icon: <LuCopy size={18} />, label: t('chat.message.copyText'), onSelect: onCopy });
  }
  if (canTranslate && onTranslate) {
    secondary.push({ key: 'translate', icon: <LuLanguages size={18} />, label: t('chat.message.translate'), onSelect: onTranslate });
  }
  if (onStartSelection) {
    secondary.push({ key: 'select', icon: <LuCircleCheck size={18} />, label: t('chat.message.select'), onSelect: onStartSelection, keepsSelection: true });
  }
  const danger: ActionItem[] = canDelete ? [{ key: 'delete', icon: <LuTrash2 size={18} />, label: t('chat.message.deleteAction'), onSelect: onDelete, tone: 'danger' }] : [];
  return { primary, secondary, danger };
}

function findScrollParent(element: HTMLElement): HTMLElement | null {
  let current = element.parentElement;
  while (current) {
    const overflowY = getComputedStyle(current).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function ActionsSheet(props: MessageActionsRowProps) {
  const { t } = useTranslation();
  const { primary, secondary, danger } = useActionItems(props);
  const isClosing = Boolean(props.isExiting);
  useEscapeKey(!isClosing, () => props.onDismiss?.());

  const run = (item: ActionItem) => (event: ReactMouseEvent) => {
    event.stopPropagation();
    item.onSelect();
    if (!item.keepsSelection) {
      props.onDismiss?.();
    }
  };

  const onDismissSheet = props.onDismiss;
  const dismissSheet = useCallback(() => onDismissSheet?.(), [onDismissSheet]);
  const backdropDismiss = useBackdropDismiss(dismissSheet);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: number; startY: number; lastY: number; lastTime: number; velocity: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const moveSheet = (offset: number) => {
    if (sheetRef.current) {
      sheetRef.current.style.transform = offset > 0 ? `translate3d(0, ${offset}px, 0)` : '';
    }
  };

  const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isClosing || (event.pointerType === 'mouse' && event.button !== 0)) {
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { id: event.pointerId, startY: event.clientY, lastY: event.clientY, lastTime: event.timeStamp, velocity: 0 };
    setIsDragging(true);
  };

  const handleDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) {
      return;
    }
    const elapsed = Math.max(1, event.timeStamp - drag.lastTime);
    drag.velocity = (event.clientY - drag.lastY) / elapsed;
    drag.lastY = event.clientY;
    drag.lastTime = event.timeStamp;
    const offset = event.clientY - drag.startY;
    moveSheet(offset > 0 ? offset : offset / 6);
  };

  const handleDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    setIsDragging(false);
    const offset = event.clientY - drag.startY;
    const height = sheetRef.current?.offsetHeight ?? 0;
    const threshold = height > 0 ? Math.min(SHEET_DISMISS_DISTANCE, height * 0.35) : SHEET_DISMISS_DISTANCE;
    if (offset > threshold || (offset > 12 && drag.velocity > SHEET_DISMISS_VELOCITY)) {
      props.onDismiss?.();
      return;
    }
    moveSheet(0);
  };

  return createPortal(
    <>
      <div
        className={`sc-actions-sheet-backdrop${isClosing ? ' is-exiting' : ''}`}
        data-no-long-press
        onPointerDown={(event) => {
          event.stopPropagation();
          backdropDismiss.onPointerDown(event);
        }}
        onClick={backdropDismiss.onClick}
      />
      <div
        ref={sheetRef}
        className={`sc-actions-sheet${isClosing ? ' is-exiting' : ''}`}
        data-dragging={isDragging || undefined}
        role="menu"
        aria-label={t('chat.message.actions')}
        data-no-long-press
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div
          className="sc-actions-sheet__handle"
          aria-hidden="true"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        >
          <span className="sc-actions-sheet__grabber" />
        </div>
        {props.sheetHeader}
        <div className="sc-actions-sheet__list">
          {[...primary, ...secondary, ...danger].map((item, index) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              data-tone={item.tone}
              className="sc-actions-sheet__item"
              style={{ '--sc-i': index } as CSSProperties}
              onClick={run(item)}
            >
              <span className="sc-actions-sheet__icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </>,
    document.body,
  );
}

function ActionsToolbar(props: MessageActionsRowProps) {
  const { t } = useTranslation();
  const { primary, secondary, danger } = useActionItems(props);
  const [menuOpen, setMenuOpen] = useState(false);
  const [popoverSide, setPopoverSide] = useState<'side' | 'top'>('side');
  const [place, setPlace] = useState<'side' | 'below'>('side');
  const menu = usePresence(menuOpen, MOTION_DURATION_MS.fast);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const ownReactButtonRef = useRef<HTMLButtonElement>(null);
  const reactRef = props.reactButtonRef ?? ownReactButtonRef;
  const overflow = [...secondary, ...danger];
  const hasPopover = Boolean(props.reactionPopover);
  const reply = primary.find((item) => item.key === 'reply');
  const forward = primary.find((item) => item.key === 'forward');
  const { isOwn, onReact } = props;
  useEscapeKey(menuOpen, () => setMenuOpen(false));

  useOutsidePointerDown(menuOpen, [rootRef], () => setMenuOpen(false));

  useLayoutEffect(() => {
    const root = rootRef.current;
    const anchor = root?.parentElement;
    const bubble = anchor?.firstElementChild;
    if (!root || !anchor?.classList.contains('sc-bubble-anchor') || !bubble) {
      setPlace('below');
      return;
    }
    const scrollParent = findScrollParent(anchor);
    const measure = () => {
      const bubbleRect = bubble.getBoundingClientRect();
      const bounds = scrollParent ? scrollParent.getBoundingClientRect() : { left: 0, right: window.innerWidth };
      const available = isOwn ? bubbleRect.left - bounds.left : bounds.right - bubbleRect.right;
      setPlace(root.offsetWidth + POPOVER_GAP_PX + POPOVER_EDGE_PX <= available ? 'side' : 'below');
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isOwn]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!hasPopover || !root) {
      return;
    }
    const scrollParent = findScrollParent(root);
    const measure = () => {
      const popover = popoverRef.current;
      if (!popover) {
        return;
      }
      const rootRect = root.getBoundingClientRect();
      const bounds = scrollParent ? scrollParent.getBoundingClientRect() : { left: 0, right: window.innerWidth };
      const available = isOwn ? rootRect.left - bounds.left : bounds.right - rootRect.right;
      setPopoverSide(popover.offsetWidth + POPOVER_GAP_PX + POPOVER_EDGE_PX <= available ? 'side' : 'top');
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' || !scrollParent ? null : new ResizeObserver(measure);
    if (observer && scrollParent) {
      observer.observe(scrollParent);
    }
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [hasPopover, isOwn]);

  const button = (key: string, label: string, icon: ReactNode, onClick: () => void, extra?: { ref?: RefObject<HTMLButtonElement | null>; active?: boolean; popup?: 'menu' }) => (
    <button
      key={key}
      ref={extra?.ref}
      type="button"
      className="sc-actions-toolbar__btn"
      title={label}
      aria-label={label}
      data-active={extra?.active ?? false}
      aria-expanded={extra?.active === undefined ? undefined : extra.active}
      aria-haspopup={extra?.popup}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {icon}
    </button>
  );

  return (
    <div
      ref={rootRef}
      className={`sc-actions-toolbar${props.isExiting ? ' is-exiting' : ''}`}
      data-own={isOwn}
      data-place={place}
      data-no-long-press
      role="toolbar"
      aria-label={t('chat.message.actions')}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && hasPopover && onReact && !event.defaultPrevented) {
          event.preventDefault();
          event.stopPropagation();
          onReact();
          reactRef.current?.focus();
        }
      }}
    >
      {reply && button('reply', reply.label, <LuReply size={16} />, reply.onSelect)}
      {onReact &&
        button(
          'react',
          t('chat.message.react'),
          <LuSmilePlus size={16} />,
          () => {
            setMenuOpen(false);
            onReact();
          },
          { ref: reactRef, active: Boolean(props.isReactionOpen) },
        )}
      {forward && button('forward', forward.label, <LuForward size={16} />, forward.onSelect)}
      {overflow.length > 0 &&
        button(
          'more',
          t('chat.message.more'),
          <LuEllipsisVertical size={16} />,
          () => {
            if (!menuOpen && hasPopover && onReact) {
              onReact();
            }
            setMenuOpen((open) => !open);
          },
          { active: menuOpen, popup: 'menu' },
        )}
      {props.reactionPopover && (
        <div ref={popoverRef} className="sc-actions-popover" data-own={isOwn} data-side={popoverSide}>
          {props.reactionPopover}
        </div>
      )}
      {menu.isPresent && (
        <div className={`sc-actions-menu${menu.isExiting ? ' is-exiting' : ''}`} role="menu" data-own={isOwn}>
          {overflow.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              data-tone={item.tone}
              className="sc-actions-menu__item"
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen(false);
                item.onSelect();
              }}
            >
              <span className="sc-actions-menu__icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MessageActionsRow(props: MessageActionsRowProps) {
  const useSheet = useMediaQuery(MESSAGE_ACTIONS_SHEET_QUERY);
  return useSheet ? <ActionsSheet {...props} /> : <ActionsToolbar {...props} />;
}
