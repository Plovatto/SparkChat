import { useState, type ComponentType, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { FEATURES, MORE_FEATURES, type FeatureId } from '../constants/content';
import { useInView } from '../hooks/useInView';
import { useCardTilt } from '../hooks/useCardTilt';
import { GifsDemo, GroupsDemo, InstallDemo, PhotoDemo, ReactionsDemo, TranslationDemo } from './FeatureDemos';

const DEMOS: Record<FeatureId, ComponentType<{ active: boolean }>> = {
  reactions: ReactionsDemo,
  gifs: GifsDemo,
  translation: TranslationDemo,
  groups: GroupsDemo,
  install: InstallDemo,
  photos: PhotoDemo,
};

export function Features() {
  const { t } = useTranslation('landing');
  const gridRef = useCardTilt<HTMLUListElement>('.lp-bento__card');
  const { ref: areaRef, inView } = useInView<HTMLDivElement>('120px');
  const [marqueePaused, setMarqueePaused] = useState(false);

  return (
    <section id="recursos" className="lp-section" aria-labelledby="recursos-title">
      <div className="lp-container" ref={areaRef}>
        <div className="lp-section__intro">
          <h2 id="recursos-title" className="lp-section__title">
            {t('features.title')}
          </h2>
          <p className="lp-section__lead">{t('features.lead')}</p>
        </div>
        <ul ref={gridRef} className="lp-bento">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            const Demo = DEMOS[feature.id];
            return (
              <li key={feature.id} className="lp-bento__card" data-area={feature.id}>
                <div className="lp-bento__demo">
                  <Demo active={inView} />
                </div>
                <div className="lp-bento__text">
                  <span className="lp-feature__icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <h3 className="lp-feature__title">{t(`features.items.${feature.id}.title`)}</h3>
                  <p className="lp-feature__text">{t(`features.items.${feature.id}.text`)}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <div
          className="lp-more"
          role="region"
          aria-label={t('features.moreLabel')}
          tabIndex={0}
          data-paused={marqueePaused ? 'true' : undefined}
          onClick={() => setMarqueePaused((value) => !value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setMarqueePaused((value) => !value);
            }
          }}
        >
          {[0, 1].map((copy) => (
            <ul key={copy} className="lp-more__track" aria-hidden={copy === 1 ? true : undefined}>
              {MORE_FEATURES.map((item, position) => {
                const Icon = item.icon;
                return (
                  <li key={item.id} className="lp-more__item" style={{ '--lp-item-index': position } as CSSProperties}>
                    <Icon size={13} aria-hidden="true" />
                    {t(`features.more.${item.id}`)}
                  </li>
                );
              })}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}
