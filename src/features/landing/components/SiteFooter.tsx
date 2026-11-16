import { useTranslation } from 'react-i18next';
import { APP_URL, LINKS } from '../constants/content';
import { BrandMark } from './BrandMark';

export function SiteFooter() {
  const { t } = useTranslation('landing');

  return (
    <>
      <section className="lp-cta" aria-labelledby="cta-title">
        <div className="lp-container lp-cta__inner">
          <BrandMark size="lg" />
          <h2 id="cta-title" className="lp-cta__title">
            {t('cta.title')}
          </h2>
          <p className="lp-cta__text">{t('cta.text')}</p>
          <a className="sc-btn sc-btn--on-gradient sc-btn--lift lp-hero__cta" href={APP_URL}>
            {t('cta.start')}
          </a>
        </div>
      </section>
      <footer className="lp-footer">
        <div className="lp-container lp-footer__inner">
          <p className="lp-footer__credit">
            {t('footer.madeBy')}{' '}
            <a className="sc-link" href={LINKS.portfolio}>
              Plovatto
            </a>
            {t('footer.openSource')}{' '}
            <a className="sc-link" href={LINKS.license}>
              {t('footer.license')}
            </a>
            .
          </p>
          <nav className="lp-footer__nav" aria-label={t('footer.links')}>
            <a className="sc-link" href={LINKS.repository}>
              {t('footer.appCode')}
            </a>
            <a className="sc-link" href={LINKS.apiRepository}>
              {t('footer.apiCode')}
            </a>
            <a className="sc-link" href={LINKS.apiDocs}>
              {t('footer.apiDocs')}
            </a>
          </nav>
        </div>
      </footer>
    </>
  );
}
