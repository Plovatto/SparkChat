import { useTranslation } from 'react-i18next';
import { useTheme } from '@features/theme';
import { qualityTone, type QualityBars } from '../lib/call-stats';

export function CallQualityBars({ bars, relayed = null }: { bars: QualityBars | null; relayed?: boolean | null }) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  if (bars === null) {
    return null;
  }
  const tone = qualityTone(bars, relayed);
  const color = tone === 'good' ? theme.success : tone === 'poor' ? theme.danger : theme.warning;
  const route = relayed === null ? '' : relayed ? t('calls.route.relay') : t('calls.route.direct');
  const label = route ? `${t('calls.quality', { bars })} · ${route}` : t('calls.quality', { bars });
  return (
    <span role="img" aria-label={label} title={label} data-tone={tone} style={{ display: 'inline-flex', alignItems: 'flex-end', gap: '2px', height: '14px' }}>
      {[1, 2, 3].map((level) => (
        <span key={level} className="sc-call-quality-bar" style={{ width: '4px', height: `${level * 4 + 2}px`, borderRadius: '1px', background: level <= bars ? color : theme.borderStrong }} />
      ))}
    </span>
  );
}
