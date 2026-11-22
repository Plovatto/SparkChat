import { Fragment, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { FaHeart, FaImage, FaLock, FaPhoneAlt, FaSmile, FaVideo } from 'react-icons/fa';
import { APP_URL, LINKS } from '../constants/content';
import { BrandMark } from './BrandMark';

const FLOATS = [
  { icon: FaHeart, kind: 'icon', x: '8%', delay: '0s', duration: '14s' },
  { icon: null, kind: 'bubble', x: '18%', delay: '-6s', duration: '17s' },
  { icon: FaPhoneAlt, kind: 'icon', x: '30%', delay: '-10s', duration: '15s' },
  { icon: FaSmile, kind: 'icon', x: '70%', delay: '-3s', duration: '16s' },
  { icon: null, kind: 'bubble', x: '80%', delay: '-11s', duration: '18s' },
  { icon: FaVideo, kind: 'icon', x: '91%', delay: '-7s', duration: '13s' },
  { icon: FaLock, kind: 'icon', x: '58%', delay: '-13s', duration: '19s' },
  { icon: FaImage, kind: 'icon', x: '42%', delay: '-2s', duration: '20s' },
];

export function SiteFooter() {
  const { t } = useTranslation('landing');
  const titleWords = t('cta.title').split(' ');

  return (
    <>
      <section className="lp-cta" aria-labelledby="cta-title">
        <div className="lp-cta__floats" aria-hidden="true">
          {FLOATS.map((item, position) => {
            const Icon = item.icon;
            return (
              <span key={position} className="lp-cta__float" data-kind={item.kind} style={{ '--lp-x': item.x, '--lp-delay': item.delay, '--lp-dur': item.duration } as CSSProperties}>
                {Icon ? (
                  <Icon size={14} />
                ) : (
                  <span className="lp-cta__dots">
                    <span />
                    <span />
                    <span />
                  </span>
                )}
              </span>
            );
          })}
        </div>
        <div className="lp-container lp-cta__inner">
          <BrandMark size="lg" />
          <h2 id="cta-title" className="lp-cta__title">
            {titleWords.map((word, index) => (
              <Fragment key={index}>
                <span className="lp-cta__word" style={{ '--lp-word-index': index } as CSSProperties}>
                  {word}
                </span>
                {index < titleWords.length - 1 ? ' ' : null}
              </Fragment>
            ))}
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
