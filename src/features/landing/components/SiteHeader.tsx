import { useTranslation } from 'react-i18next';
import { FaMoon, FaSun } from 'react-icons/fa';
import { pathForLanguage } from '@lib/i18n';
import { LanguageSwitch } from '@lib/i18n/LanguageSwitch';
import { APP_URL } from '../constants/content';
import { useLandingLanguage } from '../hooks/useLandingLanguage';
import { BrandMark } from './BrandMark';

interface SiteHeaderProps {
  isDark: boolean;
  onToggleMode: () => void;
}

const NAV_ITEMS = [
  { href: '#recursos', key: 'features' },
  { href: '#temas', key: 'themes' },
  { href: '#seguranca', key: 'security' },
  { href: '#perguntas', key: 'faq' },
] as const;

export function SiteHeader({ isDark, onToggleMode }: SiteHeaderProps) {
  const { t } = useTranslation('landing');
  const { language, changeLanguage } = useLandingLanguage();

  return (
    <header className="lp-header">
      <div className="lp-container lp-header__inner">
        <a className="lp-header__brand" href="#inicio" aria-label={t('header.home')}>
          <BrandMark />
          <span>SparkChat</span>
        </a>
        <nav className="lp-header__nav" aria-label={t('header.sections')}>
          {NAV_ITEMS.map((item) => (
            <a key={item.href} className="sc-nav-link" href={item.href}>
              {t(`header.nav.${item.key}`)}
            </a>
          ))}
        </nav>
        <div className="lp-header__actions">
          <LanguageSwitch value={language} onChange={changeLanguage} label={t('language.label')} hrefFor={pathForLanguage} />
          <button
            type="button"
            className="sc-icon-btn sc-icon-btn--soft lp-header__mode"
            onClick={onToggleMode}
            aria-label={isDark ? t('header.toLight') : t('header.toDark')}
            title={isDark ? t('header.lightTitle') : t('header.darkTitle')}
          >
            {isDark ? <FaSun size={16} /> : <FaMoon size={16} />}
          </button>
          <a className="sc-btn sc-btn--gradient sc-btn--lift lp-header__cta" href={APP_URL}>
            {t('header.signIn')}
          </a>
        </div>
      </div>
    </header>
  );
}
