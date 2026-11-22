import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FaTimes } from 'react-icons/fa';

export interface PwaPromptCardProps {
  icon: ReactNode;
  title: string;
  text: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
  busy?: boolean;
}

export function PwaPromptCard({ icon, title, text, primaryLabel, onPrimary, secondaryLabel, onSecondary, busy = false }: PwaPromptCardProps) {
  const { t } = useTranslation();

  return (
    <section className="pwa-prompt-card" aria-label={title}>
      <span className="pwa-prompt-card__icon" aria-hidden="true">
        <span className="pwa-prompt-card__glyph">{icon}</span>
      </span>
      <div className="pwa-prompt-card__body">
        <h2 className="pwa-prompt-card__title">{title}</h2>
        <p className="pwa-prompt-card__text">{text}</p>
        <div className="pwa-prompt-card__actions">
          <button type="button" onClick={onPrimary} disabled={busy} className="pwa-prompt-card__primary">
            {primaryLabel}
          </button>
          <button type="button" onClick={onSecondary} className="pwa-prompt-card__secondary">
            {secondaryLabel}
          </button>
        </div>
      </div>
      <button type="button" onClick={onSecondary} title={t('pwa.card.dismiss')} aria-label={t('pwa.card.dismiss')} className="pwa-prompt-card__close">
        <FaTimes aria-hidden="true" />
      </button>
    </section>
  );
}
