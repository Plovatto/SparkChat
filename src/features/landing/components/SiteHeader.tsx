import { FaMoon, FaSun } from 'react-icons/fa';
import { APP_URL } from '../constants/content';
import { BrandMark } from './BrandMark';

interface SiteHeaderProps {
  isDark: boolean;
  onToggleMode: () => void;
}

const NAV_ITEMS = [
  { href: '#recursos', label: 'Recursos' },
  { href: '#temas', label: 'Temas' },
  { href: '#seguranca', label: 'Segurança' },
  { href: '#perguntas', label: 'Perguntas' },
];

export function SiteHeader({ isDark, onToggleMode }: SiteHeaderProps) {
  return (
    <header className="lp-header">
      <div className="lp-container lp-header__inner">
        <a className="lp-header__brand" href="#inicio" aria-label="SparkChat, voltar ao início">
          <BrandMark />
          <span>SparkChat</span>
        </a>
        <nav className="lp-header__nav" aria-label="Seções da página">
          {NAV_ITEMS.map((item) => (
            <a key={item.href} className="sc-nav-link" href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="lp-header__actions">
          <button
            type="button"
            className="sc-icon-btn sc-icon-btn--soft lp-header__mode"
            onClick={onToggleMode}
            aria-label={isDark ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'}
            title={isDark ? 'Modo claro' : 'Modo escuro'}
          >
            {isDark ? <FaSun size={16} /> : <FaMoon size={16} />}
          </button>
          <a className="sc-btn sc-btn--gradient sc-btn--lift lp-header__cta" href={APP_URL}>
            Entrar
          </a>
        </div>
      </div>
    </header>
  );
}
