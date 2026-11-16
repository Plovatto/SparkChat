import { useState, type MouseEvent } from 'react';
import { HTML_LANG, LANGUAGES, type Language } from './language';

const NATIVE_NAMES: Record<Language, string> = { pt: 'Português', en: 'English' };

interface LanguageSwitchProps {
  value: Language;
  onChange: (language: Language) => void;
  label: string;
  variant?: 'surface' | 'gradient';
  className?: string;
  hrefFor?: (language: Language) => string;
}

export function LanguageSwitch({ value, onChange, label, variant = 'surface', className, hrefFor }: LanguageSwitchProps) {
  const [hasSwitched, setHasSwitched] = useState(false);
  const classes = ['sc-lang-switch', variant === 'gradient' ? 'sc-lang-switch--gradient' : '', className ?? ''].filter(Boolean).join(' ');

  const select = (code: Language) => (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    if (code !== value) {
      setHasSwitched(true);
      onChange(code);
    }
  };

  return (
    <div className={classes} role="group" aria-label={label} data-language={value}>
      <span key={value} className="sc-lang-switch__thumb" data-animate={hasSwitched || undefined} aria-hidden="true" />
      {LANGUAGES.map((code) =>
        hrefFor ? (
          <a
            key={code}
            href={hrefFor(code)}
            hrefLang={HTML_LANG[code]}
            className="sc-lang-switch__option"
            lang={HTML_LANG[code]}
            title={NATIVE_NAMES[code]}
            aria-current={value === code ? 'page' : undefined}
            data-active={value === code || undefined}
            onClick={select(code)}
          >
            {code.toUpperCase()}
          </a>
        ) : (
          <button
            key={code}
            type="button"
            className="sc-lang-switch__option"
            lang={HTML_LANG[code]}
            title={NATIVE_NAMES[code]}
            aria-pressed={value === code}
            data-active={value === code || undefined}
            onClick={select(code)}
          >
            {code.toUpperCase()}
          </button>
        ),
      )}
    </div>
  );
}
