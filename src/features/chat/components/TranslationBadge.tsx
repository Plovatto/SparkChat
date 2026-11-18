import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { ResolvedBubbleStyle } from '@features/theme';
import type { IncomingResult } from '@lib/translation/incoming';
import { resolveBadgeState } from '../utils/message-translation';

interface TranslationBadgeProps {
  result: IncomingResult;
  showingOriginal: boolean;
  onToggle: () => void;
  bubble: ResolvedBubbleStyle;
}

const BADGE_STYLE: CSSProperties = { margin: 0, fontSize: '0.7rem', lineHeight: 1.4 };

export function TranslationBadge({ result, showingOriginal, onToggle, bubble }: TranslationBadgeProps) {
  const { t } = useTranslation();
  if (result.status === 'none') {
    return null;
  }

  const state = resolveBadgeState(result, showingOriginal);

  const style: CSSProperties = { ...BADGE_STYLE, color: bubble.mutedTextColor };

  if (state === 'preparing') {
    return <p style={style}>{t('chat.translation.translating')}</p>;
  }

  const label =
    state === 'translated'
      ? t('chat.translation.translatedFrom', { language: t(`chat.translation.languages.${result.sourceLanguage}`) })
      : t('chat.translation.original');

  return (
    <p style={style}>
      {label}
      {' · '}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        className="sc-read-more"
        style={{ color: bubble.accentColor }}
      >
        {state === 'translated' ? t('chat.translation.showOriginal') : t('chat.translation.showTranslation')}
      </button>
    </p>
  );
}
