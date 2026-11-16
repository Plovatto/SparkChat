import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaCheck } from 'react-icons/fa';
import { HTML_LANG, LANGUAGE_NATIVE_NAMES, LANGUAGES, type Language } from './language';

interface LanguageMenuProps {
  anchorElement: HTMLElement;
  value: Language;
  label: string;
  onChange: (language: Language) => void;
  onClose: (restoreFocus: boolean) => void;
}

const GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 8;

function portalTarget(anchorElement: HTMLElement): HTMLElement {
  const scoped = anchorElement.closest<HTMLElement>('[data-theme]');
  return scoped && scoped !== document.documentElement ? scoped : document.body;
}

export function LanguageMenu({ anchorElement, value, label, onChange, onClose }: LanguageMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(() => {
    const anchor = anchorElement.getBoundingClientRect();
    return { top: anchor.bottom + GAP_PX, left: anchor.right };
  });

  useLayoutEffect(() => {
    const element = menuRef.current;
    if (!element) {
      return;
    }
    const anchor = anchorElement.getBoundingClientRect();
    const { width } = element.getBoundingClientRect();
    setPosition({
      top: anchor.bottom + GAP_PX,
      left: Math.max(VIEWPORT_MARGIN_PX, Math.min(anchor.right - width, window.innerWidth - width - VIEWPORT_MARGIN_PX)),
    });
    element.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
  }, [anchorElement]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !anchorElement.contains(target)) {
        onClose(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose(true);
      }
    };
    const handleViewportChange = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        onClose(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [onClose, anchorElement]);

  return createPortal(
    <div ref={menuRef} role="menu" aria-label={label} className="sc-lang-menu sc-anim-menu-in" style={{ top: position.top, left: position.left }}>
      {LANGUAGES.map((code) => (
        <button
          key={code}
          type="button"
          role="menuitemradio"
          aria-checked={value === code}
          lang={HTML_LANG[code]}
          className="sc-menu-item sc-lang-menu__item"
          onClick={(event) => {
            event.stopPropagation();
            onClose(true);
            if (code !== value) {
              onChange(code);
            }
          }}
        >
          <span>{LANGUAGE_NATIVE_NAMES[code]}</span>
          {value === code && <FaCheck size={11} aria-hidden="true" />}
        </button>
      ))}
    </div>,
    portalTarget(anchorElement),
  );
}
