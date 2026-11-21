import { forwardRef, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { FaPlus } from 'react-icons/fa';
import { QUICK_REACTIONS } from '../utils/reactions';

interface ReactionQuickBarProps {
  isOwn: boolean;
  ownEmoji: string | null;
  isExiting?: boolean;
  compact?: boolean;
  isPickerOpen?: boolean;
  onReact: (emoji: string) => void;
  onOpenPicker: () => void;
}

export const ReactionQuickBar = forwardRef<HTMLButtonElement, ReactionQuickBarProps>(function ReactionQuickBar(
  { isOwn, ownEmoji, isExiting = false, compact = false, isPickerOpen = false, onReact, onOpenPicker },
  moreButtonRef,
) {
  const { t } = useTranslation();
  const ownIsCustom = ownEmoji !== null && !(QUICK_REACTIONS as readonly string[]).includes(ownEmoji);

  return (
    <div
      role="toolbar"
      aria-label={t('chat.reactions.barLabel')}
      data-no-long-press
      data-compact={compact}
      className={`sc-reaction-bar ${isExiting ? 'sc-anim-pop-out' : 'sc-anim-pop-in'}`}
      style={{ transformOrigin: compact ? (isOwn ? 'bottom right' : 'bottom left') : isOwn ? 'top right' : 'top left' }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {QUICK_REACTIONS.map((emoji, index) => {
        const isActive = ownEmoji === emoji;
        return (
          <button
            key={emoji}
            type="button"
            className="sc-reaction-option"
            data-active={isActive}
            aria-pressed={isActive}
            aria-label={isActive ? t('chat.reactions.removeReaction', { emoji }) : t('chat.reactions.reactWith', { emoji })}
            title={isActive ? t('chat.reactions.removeReaction', { emoji }) : t('chat.reactions.reactWith', { emoji })}
            style={{ '--sc-anim-delay': `${index * 22}ms` } as CSSProperties}
            onClick={(event) => {
              event.stopPropagation();
              onReact(emoji);
            }}
          >
            <span className="sc-reaction-option__emoji" aria-hidden="true">
              {emoji}
            </span>
          </button>
        );
      })}
      <button
        ref={moreButtonRef}
        type="button"
        className="sc-reaction-option sc-reaction-option--more"
        data-active={ownIsCustom}
        aria-haspopup="dialog"
        aria-expanded={isPickerOpen}
        aria-label={t('chat.reactions.more')}
        title={t('chat.reactions.more')}
        style={{ '--sc-anim-delay': `${QUICK_REACTIONS.length * 22}ms` } as CSSProperties}
        onClick={(event) => {
          event.stopPropagation();
          onOpenPicker();
        }}
      >
        {ownIsCustom ? (
          <span className="sc-reaction-option__emoji" aria-hidden="true">
            {ownEmoji}
          </span>
        ) : (
          <FaPlus size={compact ? 15 : 13} aria-hidden="true" />
        )}
      </button>
    </div>
  );
});
