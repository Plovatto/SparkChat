import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { FaCheck, FaChevronDown } from 'react-icons/fa';
import { moveActive, placeMenu, typeAhead, type MenuPlacement } from './dropdown-logic';
import { useOutsidePointerDown } from '@hooks/useOutsidePointerDown';

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  value: string;
  options: readonly DropdownOption[];
  onChange: (value: string) => void;
  icon?: ReactNode;
  disabled?: boolean;
  emptyLabel?: string;
  labelledBy?: string;
  ariaLabel?: string;
}

type MenuPhase = 'closed' | 'open' | 'closing';

const CLOSE_MS = 120;
const TYPE_AHEAD_MS = 600;

export function Dropdown({ value, options, onChange, icon, disabled = false, emptyLabel, labelledBy, ariaLabel }: DropdownProps) {
  const [phase, setPhase] = useState<MenuPhase>('closed');
  const [active, setActive] = useState(-1);
  const [placement, setPlacement] = useState<MenuPlacement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typed = useRef({ buffer: '', at: 0 });
  const baseId = useId();
  const listId = `${baseId}-list`;
  const empty = options.length === 0;
  const inactive = disabled || empty;
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const display = empty ? (emptyLabel ?? '') : (selected?.label ?? options[0]?.label ?? '');
  const open = phase === 'open';
  const mounted = phase !== 'closed';

  const close = useCallback((restoreFocus: boolean) => {
    setPhase((current) => (current === 'open' ? 'closing' : current));
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
    }
    closeTimer.current = setTimeout(() => setPhase('closed'), CLOSE_MS);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  const openMenu = (start?: number) => {
    if (inactive) {
      return;
    }
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setActive(start ?? Math.max(0, selectedIndex));
    setPlacement(null);
    setPhase('open');
  };

  const commit = (index: number) => {
    const option = options[index];
    if (option) {
      onChange(option.value);
    }
    close(true);
  };

  useEffect(
    () => () => {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (inactive && phase !== 'closed') {
      setPhase('closed');
    }
  }, [inactive, phase]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const measure = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      if (!trigger) {
        return;
      }
      setPlacement(
        placeMenu({
          trigger,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          contentHeight: listRef.current?.scrollHeight ?? options.length * 40 + 12,
        }),
      );
    };
    measure();
    listRef.current?.focus({ preventScroll: true });
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, options.length]);

  useOutsidePointerDown(open, [triggerRef, listRef], () => close(false), true);

  useEffect(() => {
    if (!open || active < 0) {
      return;
    }
    listRef.current?.querySelector<HTMLElement>(`[data-index='${active}']`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (inactive) {
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openMenu(event.key === 'ArrowUp' ? Math.max(0, selectedIndex < 0 ? options.length - 1 : selectedIndex) : undefined);
    }
  };

  const onListKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (event.key === ' ' && typed.current.buffer !== '' && Date.now() - typed.current.at < TYPE_AHEAD_MS) {
        typed.current = { buffer: typed.current.buffer + ' ', at: Date.now() };
        return;
      }
      commit(active);
      return;
    }
    const next = moveActive(options.length, active, event.key);
    if (next !== null) {
      event.preventDefault();
      setActive(next);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      const buffer = (now - typed.current.at < TYPE_AHEAD_MS ? typed.current.buffer : '') + event.key;
      typed.current = { buffer, at: now };
      const match = typeAhead(
        options.map((option) => option.label),
        active,
        buffer,
      );
      if (match !== null) {
        setActive(match);
      }
    }
  };

  const menuStyle: CSSProperties | undefined = placement
    ? {
        left: `${placement.left}px`,
        width: `${placement.width}px`,
        maxHeight: `${placement.maxHeight}px`,
        ...(placement.top !== undefined ? { top: `${placement.top}px` } : {}),
        ...(placement.bottom !== undefined ? { bottom: `${placement.bottom}px` } : {}),
      }
    : { visibility: 'hidden' };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="sc-dropdown"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={labelledBy ? `${labelledBy} ${baseId}-value` : undefined}
        aria-label={labelledBy ? undefined : ariaLabel}
        disabled={inactive}
        data-open={open}
        title={display}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
      >
        {icon && (
          <span className="sc-dropdown__icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <span id={`${baseId}-value`} className="sc-dropdown__value">
          {display}
        </span>
        <FaChevronDown className="sc-dropdown__chevron" size={11} aria-hidden="true" />
      </button>
      {mounted &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            className="sc-dropdown-menu"
            data-sc-dropdown=""
            data-state={phase}
            data-placement={placement?.placement ?? 'below'}
            aria-labelledby={labelledBy}
            aria-label={labelledBy ? undefined : ariaLabel}
            aria-activedescendant={active >= 0 ? `${baseId}-option-${active}` : undefined}
            style={menuStyle}
            onKeyDown={onListKeyDown}
          >
            {options.map((option, index) => (
              <li
                key={option.value || `option-${index}`}
                id={`${baseId}-option-${index}`}
                role="option"
                data-index={index}
                aria-selected={index === selectedIndex}
                data-active={index === active}
                className="sc-dropdown-menu__option"
                title={option.label}
                onPointerMove={() => setActive(index)}
                onClick={() => commit(index)}
              >
                <span className="sc-dropdown-menu__label">{option.label}</span>
                {index === selectedIndex && <FaCheck className="sc-dropdown-menu__check" size={12} aria-hidden="true" />}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}
