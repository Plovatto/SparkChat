import { useTranslation } from 'react-i18next';
import { FEATURES } from '../constants/content';
import { useSpotlight } from '../hooks/useSpotlight';

export function Features() {
  const { t } = useTranslation('landing');
  const gridRef = useSpotlight<HTMLUListElement>();

  return (
    <section id="recursos" className="lp-section" aria-labelledby="recursos-title">
      <div className="lp-container">
        <div className="lp-section__intro">
          <h2 id="recursos-title" className="lp-section__title">
            {t('features.title')}
          </h2>
          <p className="lp-section__lead">{t('features.lead')}</p>
        </div>
        <ul ref={gridRef} className="lp-features">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <li key={feature.id} className="lp-feature">
                <span className="lp-feature__icon" aria-hidden="true">
                  <Icon size={19} />
                </span>
                <h3 className="lp-feature__title">{t(`features.items.${feature.id}.title`)}</h3>
                <p className="lp-feature__text">{t(`features.items.${feature.id}.text`)}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
