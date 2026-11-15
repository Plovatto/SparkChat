import { FaFileAlt } from 'react-icons/fa';
import { SECURITY_STEPS } from '../constants/content';
import { ScrambleText } from './ScrambleText';

export function Security() {
  return (
    <section id="seguranca" className="lp-section lp-section--sunken" aria-labelledby="seguranca-title">
      <div className="lp-container">
        <div className="lp-section__intro">
          <h2 id="seguranca-title" className="lp-section__title">
            <ScrambleText text="Privacidade que não depende de confiança" />
          </h2>
          <p className="lp-section__lead">
            A criptografia acontece no seu navegador. Nem o servidor do SparkChat consegue ler as conversas entre pessoas.
          </p>
        </div>
        <ol className="lp-steps">
          {SECURITY_STEPS.map((step) => (
            <li key={step.title} className="lp-step">
              <h3 className="lp-step__title">{step.title}</h3>
              <p className="lp-step__text">{step.text}</p>
            </li>
          ))}
        </ol>
        <div className="sc-notice sc-notice--info lp-security__note">
          <FaFileAlt size={16} aria-hidden="true" />
          <p>
            Ao criar a conta você recebe um arquivo de recuperação. Guarde-o bem: é com ele que você entra em outro aparelho sem perder o
            histórico.
          </p>
        </div>
      </div>
    </section>
  );
}
