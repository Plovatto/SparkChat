import { Fragment, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { COLOR_THEMES } from '@features/theme/constants/color-themes';
import { FaArrowRight, FaDownload, FaPhoneAlt, FaPhoneSlash, FaVideo } from 'react-icons/fa';
import { APP_INSTALL_URL, APP_URL } from '../constants/content';
import { SplashWarpField } from '@/components/common/SplashWarpField';
import { useHeroTilt } from '../hooks/useHeroTilt';
import { useInView } from '../hooks/useInView';
import { AppWindowPreview } from './AppWindowPreview';
import { DemoAvatar } from './DemoAvatar';

const COLOR_COUNT = Object.keys(COLOR_THEMES).length;

const GLOWS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

const STARS = [
  { top: '12%', left: '6%', size: 12, delay: 0 },
  { top: '24%', left: '38%', size: 15, delay: 1.1 },
  { top: '18%', left: '62%', size: 10, delay: 2.3 },
  { top: '70%', left: '82%', size: 17, delay: 0.6 },
  { top: '78%', left: '30%', size: 10, delay: 1.7 },
  { top: '10%', left: '90%', size: 11, delay: 2.9 },
  { top: '88%', left: '58%', size: 9, delay: 0.3 },
  { top: '50%', left: '4%', size: 13, delay: 2.1 },
];

function Star({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c.6 6.6 2.9 9.6 12 12-9.1 2.4-11.4 5.4-12 12-.6-6.6-2.9-9.6-12-12C9.1 9.6 11.4 6.6 12 0Z" />
    </svg>
  );
}

interface HeroProps {
  wallpaper: string | null;
  inkColor: string;
  accentColor: string;
}

export function Hero({ wallpaper, inkColor, accentColor }: HeroProps) {
  const { t } = useTranslation('landing');
  const { areaRef, targetRef } = useHeroTilt<HTMLElement, HTMLDivElement>();
  const titleWords = t('hero.title').split(' ');
  const { ref: backdropRef, inView } = useInView<HTMLDivElement>();

  return (
    <section ref={areaRef} id="inicio" className="lp-hero" aria-labelledby="hero-title">
      <div ref={backdropRef} className="lp-hero__backdrop" aria-hidden="true">
        <div className="lp-hero__glows">
          {GLOWS.map((id) => (
            <span key={id} className={`lp-glow lp-glow--${id}`}>
              <span className="lp-glow__blob" />
            </span>
          ))}
        </div>
        <SplashWarpField className="lp-hero__warp" inkColor={inkColor} accentColor={accentColor} leaving={false} paused={!inView} />
        <div className="lp-hero__stars">
          {STARS.map((star, position) => (
            <span key={position} className="lp-hero__star" style={{ top: star.top, left: star.left, '--lp-delay': `${star.delay}s` } as CSSProperties}>
              <Star size={star.size} />
            </span>
          ))}
        </div>
      </div>
      <div className="lp-container lp-hero__inner">
        <div className="lp-hero__copy">
          <h1 id="hero-title" className="lp-hero__title">
            {titleWords.map((word, index) => (
              <Fragment key={index}>
                <span className="lp-hero__word" style={{ '--lp-word-index': index } as CSSProperties}>
                  {word}
                </span>
                {index < titleWords.length - 1 ? ' ' : null}
              </Fragment>
            ))}
          </h1>
          <p className="lp-hero__lead lp-hero__enter">{t('hero.lead', { colors: COLOR_COUNT })}</p>
          <div className="lp-hero__actions lp-hero__enter">
            <a className="sc-btn sc-btn--on-gradient sc-btn--lift lp-hero__cta" href={APP_URL}>
              {t('hero.start')}
            </a>
            <a className="sc-btn sc-btn--header sc-btn--lift lp-hero__cta lp-hero__install" href={APP_INSTALL_URL}>
              <FaDownload size={14} aria-hidden="true" /> {t('hero.install')}
            </a>
          </div>
          <a className="lp-hero__themes lp-hero__enter" href="#temas">
            <span className="lp-hero__themes-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            {t('hero.tryThemes')}
            <FaArrowRight size={12} aria-hidden="true" className="lp-hero__themes-arrow" />
          </a>
          <p className="lp-hero__note lp-hero__enter">{t('hero.note')}</p>
        </div>
        <div className="lp-hero__visual">
          <div ref={targetRef} className="lp-hero__tilt">
            <AppWindowPreview wallpaper={wallpaper} />
          </div>
          <div className="lp-hero-call" aria-hidden="true">
            <span className="lp-hero-call__avatar">
              <span className="lp-hero-call__ring" />
              <span className="lp-hero-call__ring" />
              <DemoAvatar name="Heart" size={42} />
            </span>
            <span className="lp-hero-call__text">
              <strong>Camila</strong>
              <span>
                <FaVideo size={10} /> {t('preview.incomingVideo')}
              </span>
            </span>
            <span className="lp-hero-call__btn lp-hero-call__btn--decline" title={t('preview.decline')}>
              <FaPhoneSlash size={13} />
            </span>
            <span className="lp-hero-call__btn lp-hero-call__btn--answer" title={t('preview.answer')}>
              <FaPhoneAlt size={12} />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
