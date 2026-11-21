import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

const SKELETON_ROWS = 5;

export function EmojiPickerSkeleton({ columns }: { columns: number }) {
  const { t } = useTranslation();
  const cells = Array.from({ length: SKELETON_ROWS * columns }, (_, index) => index);

  return (
    <div className="sc-emoji-root sc-emoji-skeleton" aria-busy="true" data-testid="emoji-picker-loading" style={{ '--sc-emoji-columns': columns } as CSSProperties}>
      <div className="sc-emoji-toolbar">
        <div className="sc-emoji-skeleton-search shimmer-bg" />
      </div>
      <div className="sc-emoji-skeleton-grid">
        {cells.map((cell) => (
          <span key={cell} className="sc-emoji-skeleton-cell shimmer-bg" />
        ))}
      </div>
      <span className="sc-sr-only">{t('emoji.loading')}</span>
    </div>
  );
}
