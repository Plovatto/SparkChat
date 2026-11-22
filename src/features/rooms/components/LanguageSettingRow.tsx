import { useId, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { FaGlobe } from 'react-icons/fa';
import { useAppLanguage } from '@lib/i18n/app-i18n';
import { LANGUAGE_NATIVE_NAMES, LANGUAGES } from '@lib/i18n/language';
import '../styles/language-setting.css';

export function LanguageSettingRow() {
  const { t } = useTranslation();
  const { language, changeLanguage } = useAppLanguage();
  const labelId = useId();
  const activeIndex = Math.max(0, LANGUAGES.indexOf(language));

  return (
    <div className="sc-card sc-language-row">
      <span className="sc-language-row__icon" aria-hidden="true">
        <FaGlobe size={16} />
      </span>
      <span id={labelId} className="sc-language-row__label">
        {t('profile.appLanguage')}
      </span>
      <div
        className="sc-language-switch"
        role="radiogroup"
        aria-labelledby={labelId}
        style={{ '--sc-lang-count': LANGUAGES.length, '--sc-lang-index': activeIndex } as CSSProperties}
      >
        <span className="sc-language-switch__thumb" aria-hidden="true" />
        {LANGUAGES.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={option === language}
            className="sc-language-switch__option"
            data-active={option === language ? 'true' : 'false'}
            onClick={() => changeLanguage(option)}
            lang={option === 'pt' ? 'pt-BR' : 'en'}
          >
            {LANGUAGE_NATIVE_NAMES[option]}
          </button>
        ))}
      </div>
    </div>
  );
}
