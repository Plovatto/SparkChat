import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheck, FiCheckCircle, FiCopy, FiCornerUpLeft, FiCornerUpRight, FiMoreVertical, FiSmile, FiTrash2 } from 'react-icons/fi';
import { useClipboardCopy } from '@hooks/useClipboardCopy';
import '../styles/message-actions.css';

interface MessageActionsRowProps {
  isOwn: boolean;
  isExiting?: boolean;
  onReply?: () => void;
  onDelete: () => void;
  onForward?: () => void;
  onStartSelection?: (() => void) | undefined;
  copyText?: string | null;
  onReact?: (() => void) | undefined;
  reactButtonRef?: RefObject<HTMLButtonElement | null>;
  isReactionOpen?: boolean;
  reactionPopover?: ReactNode;
}

const MENU_CLOSE_AFTER_COPY_MS = 700;
const MENU_FLIP_MARGIN_PX = 96;
const POPOVER_GAP_PX = 8;
const POPOVER_EDGE_PX = 12;

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

function stagger(index: number): CSSProperties {
  return { '--sc-anim-delay': `${index * 24}ms` } as CSSProperties;
}

export function MessageActionsRow({
  isOwn,
  isExiting = false,
  onReply,
  onDelete,
  onForward,
  onStartSelection,
  copyText,
  onReact,
  reactButtonRef,
  isReactionOpen = false,
  reactionPopover,
}: MessageActionsRowProps) {
  const { t } = useTranslation();
  const clipboard = useClipboardCopy();
  const copied = clipboard.isCopied();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPlacement, setMenuPlacement] = useState<'top' | 'bottom'>('top');
  const [popoverSide, setPopoverSide] = useState<'side' | 'top'>('side');
  const popoverRef = useRef<HTMLDivElement>(null);
  const hasPopover = Boolean(reactionPopover);
  const rootRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeMenu = useCallback((restoreFocus: boolean) => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsMenuOpen(false);
    if (restoreFocus) {
      moreButtonRef.current?.focus();
    }
  }, []);

  useEffect(
    () => () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    },
    [],
  );

  useLayoutEffect(() => {
    if (!isMenuOpen) {
      return;
    }
    const menu = menuRef.current;
    const root = rootRef.current;
    if (root && menu) {
      const space = root.getBoundingClientRect().top;
      setMenuPlacement(space < menu.offsetHeight + MENU_FLIP_MARGIN_PX ? 'bottom' : 'top');
    }
    menu?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [isMenuOpen]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const popover = popoverRef.current;
    if (!hasPopover || !root || !popover) {
      return;
    }
    const rootRect = root.getBoundingClientRect();
    const scrollParent = findScrollParent(root);
    const bounds = scrollParent ? scrollParent.getBoundingClientRect() : { left: 0, right: window.innerWidth };
    const available = isOwn ? rootRect.left - bounds.left : bounds.right - rootRect.right;
    setPopoverSide(popover.offsetWidth + POPOVER_GAP_PX + POPOVER_EDGE_PX <= available ? 'side' : 'top');
  }, [hasPopover, isOwn]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        closeMenu(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [isMenuOpen, closeMenu]);

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1]?.focus();
    } else if (event.key === 'Tab') {
      closeMenu(false);
    }
  };

  const runAndClose = (action: () => void) => {
    closeMenu(false);
    action();
  };

  const handleCopy = () => {
    if (!copyText) {
      return;
    }
    clipboard.copy(copyText);
    closeTimerRef.current = setTimeout(() => closeMenu(false), MENU_CLOSE_AFTER_COPY_MS);
  };

  let buttonIndex = 0;

  return (
    <div
      ref={rootRef}
      className={`sc-msg-actions ${isExiting ? 'sc-anim-pop-out' : 'sc-anim-pop-in'}`}
      data-own={isOwn}
      data-no-long-press
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {reactionPopover && (
        <div ref={popoverRef} className="sc-msg-actions__popover" data-own={isOwn} data-side={popoverSide}>
          {reactionPopover}
        </div>
      )}

      <div role="toolbar" aria-label={t('chat.message.actionsLabel')} className="sc-msg-toolbar">
        {onReply && (
          <button
            type="button"
            className="sc-msg-toolbar__button"
            aria-label={t('chat.message.reply')}
            title={t('chat.message.reply')}
            style={stagger(buttonIndex++)}
            onClick={onReply}
          >
            <FiCornerUpLeft aria-hidden="true" />
          </button>
        )}

        {onReact && (
          <button
            ref={reactButtonRef}
            type="button"
            className="sc-msg-toolbar__button"
            data-active={isReactionOpen}
            aria-label={t('chat.message.react')}
            aria-expanded={isReactionOpen}
            title={t('chat.message.react')}
            style={stagger(buttonIndex++)}
            onClick={onReact}
          >
            <FiSmile aria-hidden="true" />
          </button>
        )}

        {onForward && (
          <button
            type="button"
            className="sc-msg-toolbar__button"
            aria-label={t('chat.message.forward')}
            title={t('chat.message.forward')}
            style={stagger(buttonIndex++)}
            onClick={onForward}
          >
            <FiCornerUpRight aria-hidden="true" />
          </button>
        )}

        <button
          ref={moreButtonRef}
          type="button"
          className="sc-msg-toolbar__button"
          data-active={isMenuOpen}
          aria-label={t('chat.message.moreActions')}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          title={t('chat.message.moreActions')}
          style={stagger(buttonIndex)}
          onClick={() => (isMenuOpen ? closeMenu(false) : setIsMenuOpen(true))}
        >
          <FiMoreVertical aria-hidden="true" />
        </button>
      </div>

      {isMenuOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={t('chat.message.moreActions')}
          className="sc-msg-menu sc-anim-pop-in"
          data-own={isOwn}
          data-placement={menuPlacement}
          onKeyDown={handleMenuKeyDown}
        >
          {copyText && (
            <button type="button" role="menuitem" className="sc-msg-menu__item" data-tone={copied ? 'success' : undefined} onClick={handleCopy}>
              {copied ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />}
              <span>{copied ? t('chat.message.copied') : t('chat.message.copy')}</span>
            </button>
          )}
          {onStartSelection && (
            <button type="button" role="menuitem" className="sc-msg-menu__item" onClick={() => runAndClose(onStartSelection)}>
              <FiCheckCircle aria-hidden="true" />
              <span>{t('chat.message.select')}</span>
            </button>
          )}
          <button type="button" role="menuitem" className="sc-msg-menu__item" data-tone="danger" onClick={() => runAndClose(onDelete)}>
            <FiTrash2 aria-hidden="true" />
            <span>{t('chat.message.delete')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
