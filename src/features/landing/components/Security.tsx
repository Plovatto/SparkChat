import { useTranslation } from 'react-i18next';
import { FaFileAlt } from 'react-icons/fa';
import { SECURITY_STEP_IDS } from '../constants/content';
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
        <div className="sc-notice sc-notice--info lp-security__note">
          <FaFileAlt size={16} aria-hidden="true" />
          <p>{t('security.recoveryNote')}</p>
        </div>
      </div>
    </section>
  );
}
