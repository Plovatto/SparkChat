import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@features/theme';
import type { IncomingResult } from '@lib/translation/incoming';
import { resolveBadgeState } from '../utils/message-translation';

interface TranslationBadgeProps {
  result: IncomingResult;
  showingOriginal: boolean;
  onToggle: () => void;
}

const BADGE_STYLE: CSSProperties = { margin: '2px 0 0', fontSize: '0.72rem', lineHeight: 1.4 };

export function TranslationBadge({ result, showingOriginal, onToggle }: TranslationBadgeProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  if (result.status === 'none') {
    return null;
  }

  const state = resolveBadgeState(result, showingOriginal);

  const style: CSSProperties = { ...BADGE_STYLE, color: theme.textMuted };

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
      >
        {state === 'translated' ? t('chat.translation.showOriginal') : t('chat.translation.showTranslation')}
      </button>
    </p>
  );
}
