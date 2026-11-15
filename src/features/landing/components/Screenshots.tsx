import arquivo640 from '../assets/chat-arquivo-640.webp';
import arquivo1280 from '../assets/chat-arquivo-1280.webp';
import assistente640 from '../assets/chat-assistente-640.webp';
import assistente1280 from '../assets/chat-assistente-1280.webp';
import desktop640 from '../assets/chat-desktop-640.webp';
import desktop1280 from '../assets/chat-desktop-1280.webp';
import { SCREENSHOTS, type Screenshot } from '../constants/content';

const SOURCES: Record<Screenshot['name'], { small: string; large: string; height: number }> = {
  'chat-assistente': { small: assistente640, large: assistente1280, height: 649 },
  'chat-desktop': { small: desktop640, large: desktop1280, height: 641 },
  'chat-arquivo': { small: arquivo640, large: arquivo1280, height: 645 },
};

export function Screenshots() {
  return (
    <section id="capturas" className="lp-section" aria-labelledby="capturas-title">
      <div className="lp-container">
        <div className="lp-section__intro">
          <h2 id="capturas-title" className="lp-section__title">
            Por dentro do SparkChat
          </h2>
          <p className="lp-section__lead">Telas reais do app, cada uma com uma cor e um papel de parede diferentes.</p>
        </div>
        <div className="lp-shots">
          {SCREENSHOTS.map((shot) => {
            const source = SOURCES[shot.name];
            return (
              <figure key={shot.name} className="lp-shot">
                <img
                  src={source.large}
                  srcSet={`${source.small} 640w, ${source.large} 1280w`}
                  sizes="(min-width: 861px) 370px, 560px"
                  width={1280}
                  height={source.height}
                  alt={shot.alt}
                  loading="lazy"
                  decoding="async"
                />
                <figcaption>{shot.caption}</figcaption>
              </figure>
            );
          })}
        </div>
      </div>
    </section>
  );
}
