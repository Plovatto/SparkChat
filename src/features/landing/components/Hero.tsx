import { Fragment, type CSSProperties } from 'react';
import { APP_URL } from '../constants/content';
import { useHeroTilt } from '../hooks/useHeroTilt';
import { AppWindowPreview } from './AppWindowPreview';

const TITLE_WORDS = 'Chat em tempo real, protegido de ponta a ponta'.split(' ');

interface HeroProps {
  wallpaper: string | null;
}

export function Hero({ wallpaper }: HeroProps) {
  const { areaRef, targetRef } = useHeroTilt<HTMLElement, HTMLDivElement>();

  return (
    <section ref={areaRef} id="inicio" className="lp-hero" aria-labelledby="hero-title">
      <span className="lp-hero__glow lp-hero__glow--a" aria-hidden="true" />
      <span className="lp-hero__glow lp-hero__glow--b" aria-hidden="true" />
      <div className="lp-container lp-hero__inner">
        <div className="lp-hero__copy">
          <h1 id="hero-title" className="lp-hero__title">
            {TITLE_WORDS.map((word, index) => (
              <Fragment key={index}>
                <span className="lp-hero__word" style={{ '--lp-word-index': index } as CSSProperties}>
                  {word}
                </span>
                {index < TITLE_WORDS.length - 1 ? ' ' : null}
              </Fragment>
            ))}
          </h1>
          <p className="lp-hero__lead lp-hero__enter">
            Mande mensagens, fotos, áudios e arquivos cifrados no seu navegador. Deixe o chat com a sua cara entre 48 cores e três modos, e
            chame o assistente SparkAI quando quiser.
          </p>
          <div className="lp-hero__actions lp-hero__enter">
            <a className="sc-btn sc-btn--on-gradient sc-btn--lift lp-hero__cta" href={APP_URL}>
              Começar a conversar
            </a>
            <a className="sc-btn sc-btn--header lp-hero__cta" href="#temas">
              Experimentar os temas
            </a>
          </div>
          <p className="lp-hero__note lp-hero__enter">Gratuito e direto no navegador, sem instalar nada.</p>
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
