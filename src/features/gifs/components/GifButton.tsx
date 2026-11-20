import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';

interface GifButtonProps {
  enabled: boolean;
  isOpen: boolean;
  disabled?: boolean;
  title?: string;
  onToggle: () => void;
}

export const GifButton = forwardRef<HTMLButtonElement, GifButtonProps>(function GifButton({ enabled, isOpen, disabled = false, title, onToggle }, ref) {
  const { t } = useTranslation();

  if (!enabled) {
    return null;
  }

  const label = isOpen ? t('gifs.close') : t('gifs.open');

  return (
    <button
      ref={ref}
      type="button"
      data-testid="gif-button"
      onClick={onToggle}
      disabled={disabled}
      title={title ?? label}
      aria-label={label}
      aria-expanded={isOpen}
      aria-haspopup="dialog"
      className={`sc-gif-btn sc-icon-btn ${isOpen ? 'sc-icon-btn--soft' : 'sc-icon-btn--muted'} sc-anim-pop-in`}
      style={{ width: '44px', height: '44px', flexShrink: 0 }}
    >
      <span aria-hidden="true" className="sc-gif-badge">
        GIF
      </span>
    </button>
  );
});
