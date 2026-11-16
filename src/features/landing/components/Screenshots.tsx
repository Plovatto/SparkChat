import { useTranslation } from 'react-i18next';
import arquivo640 from '../assets/chat-arquivo-640.webp';
import arquivo1280 from '../assets/chat-arquivo-1280.webp';
import assistente640 from '../assets/chat-assistente-640.webp';
import assistente1280 from '../assets/chat-assistente-1280.webp';
import desktop640 from '../assets/chat-desktop-640.webp';
import desktop1280 from '../assets/chat-desktop-1280.webp';
import { SCREENSHOT_NAMES, type ScreenshotName } from '../constants/content';

const SOURCES: Record<ScreenshotName, { small: string; large: string; height: number }> = {
  'chat-assistente': { small: assistente640, large: assistente1280, height: 649 },
  'chat-desktop': { small: desktop640, large: desktop1280, height: 641 },
  'chat-arquivo': { small: arquivo640, large: arquivo1280, height: 645 },
};

export function Screenshots() {
  const { t } = useTranslation('landing');

  return (
    <section id="capturas" className="lp-section" aria-labelledby="capturas-title">
      <div className="lp-container">
        <div className="lp-section__intro">
          <h2 id="capturas-title" className="lp-section__title">
            {t('screenshots.title')}
          </h2>
          <p className="lp-section__lead">{t('screenshots.lead')}</p>
        </div>
        <div className="lp-shots">
          {SCREENSHOT_NAMES.map((name) => {
            const source = SOURCES[name];
            return (
              <figure key={name} className="lp-shot">
                <img
                  src={source.large}
                  srcSet={`${source.small} 640w, ${source.large} 1280w`}
                  sizes="(min-width: 861px) 370px, 560px"
                  width={1280}
                  height={source.height}
                  alt={t(`screenshots.items.${name}.alt`)}
                  loading="lazy"
                  decoding="async"
                />
                <figcaption>{t(`screenshots.items.${name}.caption`)}</figcaption>
              </figure>
            );
          })}
        </div>
      </div>
    </section>
  );
}
