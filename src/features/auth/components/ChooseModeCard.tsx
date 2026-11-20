import { useTranslation } from 'react-i18next';
import { FaKey, FaPlusCircle } from 'react-icons/fa';
import { LuImage, LuLock, LuPalette, LuPhone } from 'react-icons/lu';
import Logo from '@/assets/Logo.svg';
import { WelcomeControls } from './WelcomeControls';
import { stagger } from './welcome-stagger';

interface ChooseModeCardProps {
  darkMode: boolean;
  onToggleTheme: () => void;
  onNewUser: () => void;
  onExistingUser: () => void;
}

const BRAND = 'SparkChat';
const FEATURES = [
  { key: 'media', icon: <LuImage size={15} /> },
  { key: 'calls', icon: <LuPhone size={15} /> },
  { key: 'themes', icon: <LuPalette size={15} /> },
] as const;

export function ChooseModeCard({ darkMode, onToggleTheme, onNewUser, onExistingUser }: ChooseModeCardProps) {
  const { t } = useTranslation();

  return (
    <section className="welcome-card" aria-labelledby="welcome-title">
      <header className="welcome-hero">
        <div className="welcome-hero__sheen" aria-hidden="true" />

        <WelcomeControls darkMode={darkMode} onToggleTheme={onToggleTheme} />

        <div className="welcome-emblem" aria-hidden="true">
          <span className="welcome-emblem__ring welcome-emblem__ring--3" />
          <span className="welcome-emblem__ring welcome-emblem__ring--2" />
          <span className="welcome-emblem__ring welcome-emblem__ring--1" />
          <span className="welcome-emblem__wave" />
          <span className="welcome-emblem__wave welcome-emblem__wave--late" />
          <span className="welcome-emblem__flash" />
          <span className="welcome-emblem__disc">
            <img src={Logo} alt="" className="welcome-emblem__logo" draggable={false} />
          </span>
        </div>

        <h1 id="welcome-title" className="welcome-title">
          <span className="sc-sr-only">{BRAND}</span>
          <span aria-hidden="true" className="welcome-title__letters">
            {BRAND.split('').map((letter, index) => (
              <span key={`${letter}-${index}`} className="welcome-title__letter" style={stagger(index)}>
                {letter}
              </span>
            ))}
          </span>
        </h1>

        <p className="welcome-tagline">{t('auth.tagline')}</p>

        <span className="welcome-badge">
          <LuLock size={12} aria-hidden="true" />
          {t('auth.welcome.e2ee')}
        </span>
      </header>

      <div className="welcome-body">
        <div className="welcome-actions">
          <button type="button" onClick={onNewUser} className="welcome-cta welcome-cta--primary" style={stagger(0)}>
            <FaPlusCircle size={17} aria-hidden="true" />
            <span>{t('auth.createAccount')}</span>
          </button>

          <button type="button" onClick={onExistingUser} className="welcome-cta welcome-cta--secondary" style={stagger(1)}>
            <FaKey size={16} aria-hidden="true" className="welcome-cta__key" />
            <span>{t('auth.haveAccount')}</span>
          </button>
        </div>

        <ul className="welcome-features" aria-label={t('auth.welcome.featuresLabel')}>
          {FEATURES.map((feature, index) => (
            <li key={feature.key} className="welcome-feature" style={stagger(index)}>
              <span className="welcome-feature__icon" aria-hidden="true">
                {feature.icon}
              </span>
              {t(`auth.welcome.features.${feature.key}`)}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
