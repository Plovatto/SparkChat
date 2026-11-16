import { useTranslation } from 'react-i18next';
import { FaChevronDown } from 'react-icons/fa';
import { FAQ_IDS } from '../constants/content';

export function Faq() {
  const { t } = useTranslation('landing');

  return (
    <section id="perguntas" className="lp-section" aria-labelledby="perguntas-title">
      <div className="lp-container lp-faq">
        <div className="lp-section__intro lp-section__intro--start">
          <h2 id="perguntas-title" className="lp-section__title">
            {t('faq.title')}
          </h2>
          <p className="lp-section__lead">{t('faq.lead')}</p>
        </div>
        <div className="lp-faq__list">
          {FAQ_IDS.map((id) => (
            <details key={id} className="sc-disclosure">
              <summary>
                <span>{t(`faq.items.${id}.question`)}</span>
                <FaChevronDown size={13} aria-hidden="true" className="sc-disclosure__icon" />
              </summary>
              <p>{t(`faq.items.${id}.answer`)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
