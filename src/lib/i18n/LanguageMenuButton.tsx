import { useCallback, useRef, useState, type CSSProperties } from 'react';
import { FaGlobe } from 'react-icons/fa';
import { LANGUAGE_NATIVE_NAMES, type Language } from './language';
import { LanguageMenu } from './LanguageMenu';

interface LanguageMenuButtonProps {
  value: Language;
  onChange: (language: Language) => void;
  label: string;
  className: string;
  style?: CSSProperties;
  iconSize?: number;
}

export function LanguageMenuButton({ value, onChange, label, className, style, iconSize = 16 }: LanguageMenuButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback((restoreFocus: boolean) => {
    setIsOpen(false);
    if (restoreFocus) {
      buttonRef.current?.focus({ preventScroll: true });
    }
  }, []);
  const title = `${label}: ${LANGUAGE_NATIVE_NAMES[value]}`;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={className}
        style={style}
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((previous) => !previous);
        }}
      >
        <FaGlobe size={iconSize} />
      </button>
      {isOpen && buttonRef.current && (
        <LanguageMenu anchorElement={buttonRef.current} value={value} label={label} onChange={onChange} onClose={close} />
      )}
    </>
  );
}
