import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { FaLock } from 'react-icons/fa';
import { COVERED_ITEMS, SECURITY_STEP_IDS } from '../constants/content';
import { ScrambleText } from './ScrambleText';

export function Security() {
  const { t } = useTranslation('landing');
  const title = t('security.title');

  return (
    <section id="seguranca" className="lp-section lp-section--sunken" aria-labelledby="seguranca-title">
      <div className="lp-container">
        <div className="lp-section__intro">
          <h2 id="seguranca-title" className="lp-section__title">
            <ScrambleText key={title} text={title} />
          </h2>
          <p className="lp-section__lead">{t('security.lead')}</p>
        </div>
        <ol className="lp-steps">
          {SECURITY_STEP_IDS.map((id) => (
            <li key={id} className="lp-step">
              <h3 className="lp-step__title">{t(`security.steps.${id}.title`)}</h3>
              <p className="lp-step__text">{t(`security.steps.${id}.text`)}</p>
            </li>
          ))}
        </ol>
        <div className="lp-vault">
          <div className="lp-vault__hero">
            <span className="lp-vault__lock" aria-hidden="true">
              <span className="lp-vault__ring" />
              <span className="lp-vault__ring lp-vault__ring--inner" />
              <span className="lp-vault__core">
                <FaLock size={30} />
              </span>
            </span>
            <h3 className="lp-vault__title">{t('security.coveredTitle')}</h3>
            <p className="lp-vault__text">{t('security.coveredText')}</p>
          </div>
          <ul className="lp-vault__list">
            {COVERED_ITEMS.map((item, position) => {
              const Icon = item.icon;
              return (
                <li key={item.id} className="lp-vault__item" style={{ '--lp-lock-index': position } as CSSProperties}>
                  <span className="lp-vault__icon" aria-hidden="true">
                    <Icon size={15} />
                  </span>
                  <span className="lp-vault__body">
                    <span className="lp-vault__label">{t(`security.covered.${item.id}`)}</span>
                    <span className="lp-vault__cipher" aria-hidden="true">
                      {item.cipher}
                    </span>
                  </span>
                  <span className="lp-vault__check" aria-hidden="true">
                    <FaLock size={9} />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
