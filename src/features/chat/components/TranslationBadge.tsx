import type { CSSProperties, MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ResolvedBubbleStyle } from '@features/theme';
import type { IncomingResult } from '@lib/translation/incoming';
import type { TranslationControl } from '../utils/message-translation';

interface TranslationBadgeProps {
  control: TranslationControl;
  result: IncomingResult;
  onToggle: () => void;
  onTranslate: () => void;
  bubble: ResolvedBubbleStyle;
}

const BADGE_STYLE: CSSProperties = { margin: 0, fontSize: '0.7rem', lineHeight: 1.4 };

export function TranslationBadge({ control, result, onToggle, onTranslate, bubble }: TranslationBadgeProps) {
  const { t } = useTranslation();
  const isPreparing = control === 'preparing';
  const isTranslatedState = control === 'translated' || control === 'original';
  const translatedLabel =
    result.status === 'translated'
      ? t('chat.translation.translatedFrom', { language: t(`chat.translation.languages.${result.sourceLanguage}`) })
      : '';
  const announcement = isPreparing ? t('chat.translation.translating') : control === 'translated' ? translatedLabel : '';

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (isPreparing) {
      return;
    }
    if (isTranslatedState) {
      onToggle();
    } else {
      onTranslate();
    }
  };

  const buttonText = isPreparing
    ? t('chat.translation.translating')
    : control === 'translated'
      ? t('chat.translation.showOriginal')
      : control === 'original'
        ? t('chat.translation.showTranslation')
        : t('chat.translation.translate');

  return (
    <>
      <span aria-live="polite" className="visually-hidden">
        {announcement}
      </span>
      {control !== 'none' && (
        <p style={{ ...BADGE_STYLE, color: bubble.mutedTextColor }}>
          {isTranslatedState ? `${control === 'translated' ? translatedLabel : t('chat.translation.original')} · ` : null}
          <button
            type="button"
            onClick={handleClick}
            aria-disabled={isPreparing || undefined}
            className="sc-read-more"
            style={{ color: isPreparing ? bubble.mutedTextColor : bubble.accentColor, cursor: isPreparing ? 'default' : undefined }}
          >
            {buttonText}
          </button>
        </p>
      )}
    </>
  );
}
