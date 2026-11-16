import { Fragment, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { COLOR_THEMES } from '@features/theme/constants/color-themes';
import { APP_URL } from '../constants/content';
import { useHeroTilt } from '../hooks/useHeroTilt';
import { AppWindowPreview } from './AppWindowPreview';

const COLOR_COUNT = Object.keys(COLOR_THEMES).length;

interface HeroProps {
  wallpaper: string | null;
}

export function Hero({ wallpaper }: HeroProps) {
  const { t } = useTranslation('landing');
  const { areaRef, targetRef } = useHeroTilt<HTMLElement, HTMLDivElement>();
  const titleWords = t('hero.title').split(' ');

  return (
    <section ref={areaRef} id="inicio" className="lp-hero" aria-labelledby="hero-title">
      <span className="lp-hero__glow lp-hero__glow--a" aria-hidden="true" />
      <span className="lp-hero__glow lp-hero__glow--b" aria-hidden="true" />
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
            <a className="sc-btn sc-btn--header lp-hero__cta" href="#temas">
              {t('hero.tryThemes')}
            </a>
          </div>
          <p className="lp-hero__note lp-hero__enter">{t('hero.note')}</p>
        </div>
        <div className="lp-hero__visual">
          <div ref={targetRef} className="lp-hero__tilt">
            <AppWindowPreview wallpaper={wallpaper} />
          </div>
        </div>
      </div>
    </section>
  );
}
