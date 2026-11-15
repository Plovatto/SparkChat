import { APP_URL, LINKS } from '../constants/content';
import { BrandMark } from './BrandMark';

export function SiteFooter() {
  return (
    <>
      <section className="lp-cta" aria-labelledby="cta-title">
        <div className="lp-container lp-cta__inner">
          <BrandMark size="lg" />
          <h2 id="cta-title" className="lp-cta__title">
            Sua próxima conversa começa aqui
          </h2>
          <p className="lp-cta__text">Crie a conta em menos de um minuto e chame quem você quiser.</p>
          <a className="sc-btn sc-btn--on-gradient sc-btn--lift lp-hero__cta" href={APP_URL}>
            Começar a conversar
          </a>
        </div>
      </section>
      <footer className="lp-footer">
        <div className="lp-container lp-footer__inner">
          <p className="lp-footer__credit">
            SparkChat, feito por{' '}
            <a className="sc-link" href={LINKS.portfolio}>
              Plovatto
            </a>
            . Código aberto sob a{' '}
            <a className="sc-link" href={LINKS.license}>
              licença MIT
            </a>
            .
          </p>
          <nav className="lp-footer__nav" aria-label="Links do projeto">
            <a className="sc-link" href={LINKS.repository}>
              Código do app
            </a>
            <a className="sc-link" href={LINKS.apiRepository}>
              Código da API
            </a>
            <a className="sc-link" href={LINKS.apiDocs}>
              Documentação da API
            </a>
          </nav>
        </div>
      </footer>
    </>
  );
}
