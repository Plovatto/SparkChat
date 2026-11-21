import { forwardRef } from 'react';
import { FaRegSmile } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { preloadEmojiPicker } from '../utils/load-emoji-picker';

interface EmojiButtonProps {
  isOpen: boolean;
  disabled?: boolean;
  title?: string;
  className?: string;
  onToggle: () => void;
}

export const EmojiButton = forwardRef<HTMLButtonElement, EmojiButtonProps>(function EmojiButton(
  { isOpen, disabled = false, title, className = '', onToggle },
  ref,
) {
  const { t } = useTranslation();
  const label = isOpen ? t('emoji.close') : t('emoji.open');

  return (
    <button
      ref={ref}
      type="button"
      data-testid="emoji-button"
      onClick={onToggle}
      onPointerEnter={preloadEmojiPicker}
      onFocus={preloadEmojiPicker}
      onMouseDown={(event) => event.preventDefault()}
      disabled={disabled}
      title={title ?? label}
      aria-label={label}
      aria-expanded={isOpen}
      aria-haspopup="dialog"
      className={`sc-emoji-btn ${className}`.trim()}
    >
      <FaRegSmile size={20} aria-hidden="true" />
    </button>
  );
});
