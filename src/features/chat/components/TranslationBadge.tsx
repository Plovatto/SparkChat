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
  if (control === 'none') {
    return null;
  }

  const style: CSSProperties = { ...BADGE_STYLE, color: bubble.mutedTextColor };
  const linkStyle: CSSProperties = { color: bubble.accentColor };
  const handle = (action: () => void) => (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    action();
  };

  if (control === 'preparing') {
    return (
      <p style={style} role="status">
        {t('chat.translation.translating')}
      </p>
    );
  }

  if (control === 'offer') {
    return (
      <p style={style}>
        <button type="button" onClick={handle(onTranslate)} className="sc-read-more" style={linkStyle}>
          {t('chat.translation.translate')}
        </button>
      </p>
    );
  }

  const label =
    control === 'translated' && result.status === 'translated'
      ? t('chat.translation.translatedFrom', { language: t(`chat.translation.languages.${result.sourceLanguage}`) })
      : t('chat.translation.original');

  return (
    <p style={style}>
      {label}
      {' · '}
      <button type="button" onClick={handle(onToggle)} className="sc-read-more" style={linkStyle}>
        {control === 'translated' ? t('chat.translation.showOriginal') : t('chat.translation.showTranslation')}
      </button>
    </p>
  );
}
