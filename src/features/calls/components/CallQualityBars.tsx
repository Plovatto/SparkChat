import { useTranslation } from 'react-i18next';
import { useTheme } from '@features/theme';
import type { QualityBars } from '../lib/call-stats';

export function CallQualityBars({ bars }: { bars: QualityBars | null }) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  if (bars === null) {
    return null;
  }
  const color = bars === 3 ? theme.success : bars === 2 ? theme.warning : theme.danger;
  return (
    <span role="img" aria-label={t('calls.quality', { bars })} style={{ display: 'inline-flex', alignItems: 'flex-end', gap: '2px', height: '14px' }}>
      {[1, 2, 3].map((level) => (
        <span key={level} style={{ width: '4px', height: `${level * 4 + 2}px`, borderRadius: '1px', background: level <= bars ? color : theme.borderStrong }} />
      ))}
    </span>
  );
}
