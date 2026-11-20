import { useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LuArrowLeft, LuGlobe, LuMoon, LuSun } from 'react-icons/lu';
import Logo from '@/assets/Logo.svg';
import { useAppLanguage } from '@lib/i18n/app-i18n';
import { LanguageMenuButton } from '@lib/i18n/LanguageMenuButton';
import { stagger } from './welcome-stagger';

interface WelcomeControlsProps {
  darkMode: boolean;
  onToggleTheme: () => void;
}

export function WelcomeControls({ darkMode, onToggleTheme }: WelcomeControlsProps) {
  const { t } = useTranslation();
  const { language, changeLanguage } = useAppLanguage();
  const [spins, setSpins] = useState(0);

  const handleToggleTheme = () => {
    onToggleTheme();
    setSpins((previous) => previous + 1);
  };

  return (
    <div className="welcome-controls">
      <LanguageMenuButton
        value={language}
        onChange={changeLanguage}
        label={t('language.label')}
        className="welcome-icon-button"
        icon={<LuGlobe size={17} />}
        style={stagger(0)}
      />
      <button
        type="button"
        className="welcome-icon-button"
        onClick={handleToggleTheme}
        title={darkMode ? t('auth.lightTitle') : t('auth.darkTitle')}
        aria-label={darkMode ? t('auth.toLight') : t('auth.toDark')}
        style={stagger(1)}
      >
        <span className="welcome-icon-button__spin" style={{ '--welcome-spins': spins } as CSSProperties}>
          {darkMode ? <LuSun size={17} /> : <LuMoon size={17} />}
        </span>
      </button>
    </div>
  );
}

interface WelcomeFormHeroProps {
  darkMode: boolean;
  onToggleTheme: () => void;
  onBack: () => void;
  titleId: string;
  title: ReactNode;
  subtitle: string;
  showLogo?: boolean;
}

export function WelcomeFormHero({ darkMode, onToggleTheme, onBack, titleId, title, subtitle, showLogo = false }: WelcomeFormHeroProps) {
  const { t } = useTranslation();

  return (
    <header className={`welcome-hero welcome-hero--form${showLogo ? ' welcome-hero--with-logo' : ''}`}>
      <div className="welcome-hero__sheen" aria-hidden="true" />
      <button type="button" className="welcome-icon-button welcome-back" onClick={onBack} title={t('common.back')} aria-label={t('common.back')}>
        <LuArrowLeft size={17} />
      </button>
      <WelcomeControls darkMode={darkMode} onToggleTheme={onToggleTheme} />
      {showLogo && (
        <span className="welcome-mini-emblem" aria-hidden="true">
          <img src={Logo} alt="" draggable={false} />
        </span>
      )}
      <h1 id={titleId} className="welcome-form-title">
        {title}
      </h1>
      <p key={subtitle} className="welcome-form-subtitle">
        {subtitle}
      </p>
    </header>
  );
}
