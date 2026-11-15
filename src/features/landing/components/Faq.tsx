import { FaChevronDown } from 'react-icons/fa';
import { FAQ } from '../constants/content';

export function Faq() {
  return (
    <section id="perguntas" className="lp-section" aria-labelledby="perguntas-title">
      <div className="lp-container lp-faq">
        <div className="lp-section__intro lp-section__intro--start">
          <h2 id="perguntas-title" className="lp-section__title">
            Perguntas frequentes
          </h2>
          <p className="lp-section__lead">O que costuma surgir antes da primeira mensagem.</p>
        </div>
        <div className="lp-faq__list">
          {FAQ.map((item) => (
            <details key={item.question} className="sc-disclosure">
              <summary>
                <span>{item.question}</span>
                <FaChevronDown size={13} aria-hidden="true" className="sc-disclosure__icon" />
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
