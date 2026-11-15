import { FEATURES } from '../constants/content';
import { useSpotlight } from '../hooks/useSpotlight';

export function Features() {
  const gridRef = useSpotlight<HTMLUListElement>();

  return (
    <section id="recursos" className="lp-section" aria-labelledby="recursos-title">
      <div className="lp-container">
        <div className="lp-section__intro">
          <h2 id="recursos-title" className="lp-section__title">
            Tudo o que uma boa conversa precisa
          </h2>
          <p className="lp-section__lead">Do recado rápido ao áudio comprido, sem abrir mão da privacidade.</p>
        </div>
        <ul ref={gridRef} className="lp-features">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <li key={feature.title} className="lp-feature">
                <span className="lp-feature__icon" aria-hidden="true">
                  <Icon size={19} />
                </span>
                <h3 className="lp-feature__title">{feature.title}</h3>
                <p className="lp-feature__text">{feature.text}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
